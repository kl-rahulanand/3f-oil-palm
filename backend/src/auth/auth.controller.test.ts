import "reflect-metadata";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { ExecutionContext, HttpException } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { createDb, createPool } from "../db/pool";
import { loadConfig } from "../config";
import { auditEvents, otpCodes, refreshTokens, rolePerms, roles, sessions, userRoles, users } from "../db/schema";
import { AuditService } from "../core/audit.service";
import { SessionService } from "../core/session.service";
import { AuthController } from "./auth.controller";
import { JwtAuthGuard, type AuthedRequest } from "./auth.guard";
import { RbacService } from "../core/rbac.service";
import { SemanticLayer } from "../semantic/semanticLayer";
import type { QueryResult, Warehouse } from "../warehouse/warehouse.interface";
import { AUTH_RATE_LIMIT } from "./auth.constants";
import { CsrfGuard } from "./csrf.guard";
import { AUTH_COOKIE_NAMES, CSRF_HEADER } from "./cookies";
import { LoginRateLimitService } from "./rate-limit.service";

process.env.AUTH_OTP_MOCK = "true";
const pool = createPool();
const db = createDb(pool);
const sessionService = new SessionService(db);
const audit = new AuditService(db);
const rbac = new RbacService(db, makeWarehouse(), new SemanticLayer());
const createdEmails: string[] = [];
let counter = 0;

after(async () => {
  await db
    .delete(auditEvents)
    .where(
      inArray(auditEvents.eventType, [
        "auth.otp_requested",
        "auth.otp_verified",
        "auth.otp_failed",
      ]),
    );
  for (const email of createdEmails) {
    await db.delete(users).where(eq(users.email, email));
  }
  await pool.end();
});

test("OTP request returns the same ack for active, unknown, and deactivated emails", async () => {
  const active = await createUser({ isActive: true });
  const inactive = await createUser({ isActive: false });
  const controller = makeController();

  const activeAck = await controller.requestOtp({ email: active.email }, makeRequest("10.1.0.1"));
  const inactiveAck = await controller.requestOtp({ email: inactive.email }, makeRequest("10.1.0.2"));
  const unknownAck = await controller.requestOtp(
    { email: uniqueEmail("unknown") },
    makeRequest("10.1.0.3"),
  );

  assert.deepEqual(activeAck, { ok: true });
  assert.deepEqual(inactiveAck, activeAck);
  assert.deepEqual(unknownAck, activeAck);
  assert.equal(await countCodes(active.id), 1);
  assert.equal(await countCodes(inactive.id), 0);
});

test("OTP request enforces resend cooldown without changing the uniform ack", async () => {
  const user = await createUser({ isActive: true });
  const controller = makeController();

  assert.deepEqual(await controller.requestOtp({ email: user.email }, makeRequest("10.1.0.4")), {
    ok: true,
  });
  assert.deepEqual(await controller.requestOtp({ email: user.email }, makeRequest("10.1.0.5")), {
    ok: true,
  });

  assert.equal(await countCodes(user.id), 1);
});

test("OTP request throttle is enforced per IP/email", async () => {
  const controller = makeController();
  const email = uniqueEmail("throttle");

  for (let i = 0; i < AUTH_RATE_LIMIT.limit; i += 1) {
    assert.deepEqual(await controller.requestOtp({ email }, makeRequest("10.1.0.6")), { ok: true });
  }

  const sixth = await captureHttpException(() =>
    controller.requestOtp({ email }, makeRequest("10.1.0.6")),
  );
  assert.equal(sixth.status, 429);
});

test("valid OTP verifies once, creates a session, returns AuthUser, and writes audit events", async () => {
  const user = await createUser({ isActive: true });
  const controller = makeController();
  await insertOtp(user.id, "123456", new Date(Date.now() + AUTH_RATE_LIMIT.otpExpiresMs));
  const res = makeResponse();

  const response = await controller.verifyOtp(
    { email: user.email, code: "123456" },
    makeRequest("10.1.0.7"),
    res,
  );

  assert.equal(response.id, user.id);
  assert.equal(response.email, user.email);
  assert.equal(response.display_name, user.displayName);
  assert.equal(response.is_active, true);
  assert.deepEqual(response.roles, ["analyst"]);
  assert.ok(response.permissions.actions.includes("save"));
  assert.equal(await activeCodeCount(user.id), 0);
  assert.equal((await db.select().from(sessions).where(eq(sessions.userId, user.id))).length, 1);
  assert.equal((await db.select().from(refreshTokens).where(eq(refreshTokens.userId, user.id))).length, 1);
  assert.ok(res.cookies[AUTH_COOKIE_NAMES.access]?.value);
  assert.ok(res.cookies[AUTH_COOKIE_NAMES.refresh]?.value);
  assert.equal(res.cookies[AUTH_COOKIE_NAMES.access]?.options.httpOnly, true);
  assert.equal(res.cookies[AUTH_COOKIE_NAMES.refresh]?.options.httpOnly, true);
  assert.equal(res.cookies[AUTH_COOKIE_NAMES.csrf]?.options.httpOnly, false);

  const events = await authEventTypes(user.id);
  assert.ok(events.includes("auth.otp_verified"));
});

test("me returns the guard-resolved AuthUser from the access cookie", async () => {
  const user = await createUser({ isActive: true });
  const tokens = await sessionService.create(user.id);
  const guard = new JwtAuthGuard(sessionService, rbac);
  const req = makeRequest("10.1.0.30", cookieHeader({ [AUTH_COOKIE_NAMES.access]: tokens.accessToken }));

  assert.equal(await guard.canActivate(makeContext(req, makeResponse())), true);

  const response = makeController().me(req);
  assert.equal(response.id, user.id);
  assert.equal(response.email, user.email);
});

test("refresh rotates the refresh token and rejects reuse of the old token", async () => {
  const user = await createUser({ isActive: true });
  const tokens = await sessionService.create(user.id);
  const controller = makeController();
  const res = makeResponse();

  assert.deepEqual(
    await controller.refresh(
      makeRequest("10.1.0.31", cookieHeader({ [AUTH_COOKIE_NAMES.refresh]: tokens.refreshToken })),
      res,
    ),
    { ok: true },
  );

  assert.ok(res.cookies[AUTH_COOKIE_NAMES.access]?.value);
  assert.ok(res.cookies[AUTH_COOKIE_NAMES.refresh]?.value);
  const old = (await db.select().from(refreshTokens).where(eq(refreshTokens.jti, tokens.refreshJti)))[0];
  assert.ok(old.revokedAt);

  const reuse = await captureHttpException(() =>
    controller.refresh(
      makeRequest("10.1.0.32", cookieHeader({ [AUTH_COOKIE_NAMES.refresh]: tokens.refreshToken })),
      makeResponse(),
    ),
  );
  assert.equal(reuse.status, 401);
});

test("logout revokes the current refresh token and clears auth cookies", async () => {
  const user = await createUser({ isActive: true });
  const tokens = await sessionService.create(user.id);
  const controller = makeController();
  const req = makeRequest(
    "10.1.0.33",
    cookieHeader({
      [AUTH_COOKIE_NAMES.access]: tokens.accessToken,
      [AUTH_COOKIE_NAMES.refresh]: tokens.refreshToken,
    }),
  );
  req.authUser = await rbac.resolveUser(user.id) ?? undefined;
  req.sessionId = tokens.sessionId;
  req.refreshToken = tokens.refreshToken;
  const res = makeResponse();

  assert.deepEqual(await controller.logout(req, res), { ok: true });

  const row = (await db.select().from(refreshTokens).where(eq(refreshTokens.jti, tokens.refreshJti)))[0];
  assert.ok(row.revokedAt);
  assert.ok(res.cleared.some((cookie: { name: string }) => cookie.name === AUTH_COOKIE_NAMES.access));
  assert.ok(res.cleared.some((cookie: { name: string }) => cookie.name === AUTH_COOKIE_NAMES.refresh));
});

test("guard rejects missing, invalid, and inactive access cookies", async () => {
  const active = await createUser({ isActive: true });
  const inactive = await createUser({ isActive: false });
  const activeTokens = await sessionService.create(active.id);
  const inactiveTokens = await sessionService.create(inactive.id);
  const guard = new JwtAuthGuard(sessionService, rbac);

  for (const req of [
    makeRequest("10.1.0.34"),
    makeRequest("10.1.0.35", cookieHeader({ [AUTH_COOKIE_NAMES.access]: "not-a-jwt" })),
    makeRequest("10.1.0.36", cookieHeader({ [AUTH_COOKIE_NAMES.access]: inactiveTokens.accessToken })),
  ]) {
    const error = await captureHttpException(() => guard.canActivate(makeContext(req, makeResponse())));
    assert.equal(error.status, 401);
  }

  const okReq = makeRequest("10.1.0.37", cookieHeader({ [AUTH_COOKIE_NAMES.access]: activeTokens.accessToken }));
  assert.equal(await guard.canActivate(makeContext(okReq, makeResponse())), true);
});

test("CSRF guard rejects mutating requests without matching double-submit token", () => {
  const guard = new CsrfGuard();
  const missing = makeRequest("10.1.0.38", undefined, "POST");
  assert.throws(
    () => guard.canActivate(makeContext(missing, makeResponse())),
    (err: unknown) => err instanceof HttpException && err.getStatus() === 403,
  );

  const ok = makeRequest(
    "10.1.0.39",
    cookieHeader({ [AUTH_COOKIE_NAMES.csrf]: "csrf-token" }),
    "POST",
    { [CSRF_HEADER]: "csrf-token" },
  );
  assert.equal(guard.canActivate(makeContext(ok, makeResponse())), true);
});

test("mock transport fixed code verifies even though the stored hash is a real generated code", async () => {
  const user = await createUser({ isActive: true });
  const controller = makeController();
  await controller.requestOtp({ email: user.email }, makeRequest("10.1.0.8"));

  const response = await controller.verifyOtp(
    { email: user.email, code: "000000" },
    makeRequest("10.1.0.8"),
    makeResponse(),
  );

  assert.equal(response.id, user.id);
});

test("invalid OTP increments attempts and invalidates on the fifth failure", async () => {
  const user = await createUser({ isActive: true });
  const controller = makeController();
  await insertOtp(user.id, "123456", new Date(Date.now() + AUTH_RATE_LIMIT.otpExpiresMs));

  for (let i = 1; i <= AUTH_RATE_LIMIT.otpAttemptCap; i += 1) {
    const failure = await captureHttpException(() =>
      controller.verifyOtp(
        { email: user.email, code: "654321" },
        makeRequest(`10.1.0.${10 + i}`),
        makeResponse(),
      ),
    );
    assert.equal(failure.status, 401);
  }

  assert.equal(await activeCodeCount(user.id), 0);
  assert.equal((await authEventTypes(user.id)).filter((e) => e === "auth.otp_failed").length, 5);
});

test("expired OTP fails uniformly and is consumed", async () => {
  const user = await createUser({ isActive: true });
  const controller = makeController();
  await insertOtp(user.id, "123456", new Date(Date.now() - 1000));

  const failure = await captureHttpException(() =>
    controller.verifyOtp({ email: user.email, code: "123456" }, makeRequest("10.1.0.20"), makeResponse()),
  );

  assert.equal(failure.status, 401);
  assert.equal(failure.message, "invalid or expired code");
  assert.equal(await activeCodeCount(user.id), 0);
});

test("consumed OTP cannot be reused", async () => {
  const user = await createUser({ isActive: true });
  const controller = makeController();
  await insertOtp(user.id, "123456", new Date(Date.now() + AUTH_RATE_LIMIT.otpExpiresMs));

  await controller.verifyOtp({ email: user.email, code: "123456" }, makeRequest("10.1.0.21"), makeResponse());
  const reused = await captureHttpException(() =>
    controller.verifyOtp({ email: user.email, code: "123456" }, makeRequest("10.1.0.22"), makeResponse()),
  );

  assert.equal(reused.status, 401);
});

test("unknown verify failure matches deactivated verify failure", async () => {
  const inactive = await createUser({ isActive: false });
  const controller = makeController();

  const unknown = await captureHttpException(() =>
    controller.verifyOtp(
      { email: uniqueEmail("missing"), code: "123456" },
      makeRequest("10.1.0.23"),
      makeResponse(),
    ),
  );
  const deactivated = await captureHttpException(() =>
    controller.verifyOtp({ email: inactive.email, code: "123456" }, makeRequest("10.1.0.24"), makeResponse()),
  );

  assert.equal(unknown.status, 401);
  assert.deepEqual(deactivated, unknown);
});

test("production config refuses AUTH_OTP_MOCK", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousOtpMock = process.env.AUTH_OTP_MOCK;
  process.env.NODE_ENV = "production";
  process.env.AUTH_OTP_MOCK = "true";

  try {
    assert.throws(() => loadConfig(), /AUTH_OTP_MOCK must not be enabled in production/);
  } finally {
    restoreEnv("NODE_ENV", previousNodeEnv);
    restoreEnv("AUTH_OTP_MOCK", previousOtpMock);
  }
});

function makeController(): AuthController {
  return new AuthController(db, sessionService, audit, new LoginRateLimitService());
}

async function createUser(options: { isActive: boolean }): Promise<{
  id: string;
  email: string;
  displayName: string;
}> {
  const email = uniqueEmail("user");
  const displayName = `User ${counter}`;
  await db.insert(roles).values({ name: "analyst", label: "Analyst" }).onConflictDoNothing();
  await db
    .insert(rolePerms)
    .values({ role: "analyst", grantType: "action", grantId: "save" })
    .onConflictDoNothing();
  const inserted = await db
    .insert(users)
    .values({ email, displayName, isActive: options.isActive })
    .returning({ id: users.id });
  await db.insert(userRoles).values({ userId: inserted[0].id, role: "analyst" });
  createdEmails.push(email);
  return { id: inserted[0].id, email, displayName };
}

async function insertOtp(userId: string, code: string, expiresAt: Date): Promise<void> {
  await db.insert(otpCodes).values({
    userId,
    codeHash: await bcrypt.hash(code, 4),
    expiresAt,
  });
}

async function countCodes(userId: string): Promise<number> {
  return (await db.select().from(otpCodes).where(eq(otpCodes.userId, userId))).length;
}

async function activeCodeCount(userId: string): Promise<number> {
  return (
    await db
      .select()
      .from(otpCodes)
      .where(and(eq(otpCodes.userId, userId), isNull(otpCodes.consumedAt)))
  ).length;
}

async function authEventTypes(userId: string): Promise<string[]> {
  return (
    await db
      .select({ eventType: auditEvents.eventType })
      .from(auditEvents)
      .where(eq(auditEvents.userId, userId))
  ).map((event) => event.eventType);
}

function uniqueEmail(prefix: string): string {
  counter += 1;
  return `${prefix}.${Date.now()}.${counter}@example.com`;
}

type MockResponse = {
  cookies: Record<string, { value: string; options: Record<string, unknown> }>;
  cleared: Array<{ name: string; options: Record<string, unknown> }>;
  cookie: (name: string, value: string, options: Record<string, unknown>) => MockResponse;
  clearCookie: (name: string, options: Record<string, unknown>) => MockResponse;
};

function makeResponse(): MockResponse & any {
  const res: MockResponse = {
    cookies: {},
    cleared: [],
    cookie(name, value, options) {
      this.cookies[name] = { value, options };
      return this;
    },
    clearCookie(name, options) {
      this.cleared.push({ name, options });
      return this;
    },
  };
  return res;
}

function makeRequest(
  ip: string,
  cookie?: string,
  method = "POST",
  extraHeaders: Record<string, string> = {},
): AuthedRequest {
  return {
    ip,
    path: "/api/auth/otp",
    url: "/api/auth/otp",
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...extraHeaders,
    },
  } as AuthedRequest;
}

function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");
}

function makeContext(req: AuthedRequest, res: MockResponse): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as ExecutionContext;
}

async function captureHttpException(
  fn: () => Promise<unknown>,
): Promise<{ status: number; message: string }> {
  try {
    await fn();
  } catch (err) {
    assert.ok(err instanceof HttpException);
    const response = err.getResponse();
    return {
      status: err.getStatus(),
      message:
        typeof response === "string"
          ? response
          : String((response as { message?: unknown }).message),
    };
  }
  assert.fail("expected HttpException");
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function makeWarehouse(): Warehouse {
  return {
    async explain(_sql: string): Promise<void> {},
    async execute(_sql: string): Promise<QueryResult> {
      return { columns: [], rows: [] };
    },
    async freshness(_goldObject: string): Promise<string | null> {
      return null;
    },
    async distinctValues(_goldObject: string, _column: string): Promise<string[]> {
      return [];
    },
  };
}
