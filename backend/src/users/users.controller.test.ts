import "reflect-metadata";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { ExecutionContext, HttpException } from "@nestjs/common";
import type { AuthUser } from "@pulse/contract";
import { count, desc, eq } from "drizzle-orm";
import { createDb, createPool } from "../db/pool";
import { auditEvents, users } from "../db/schema";
import { AuditService } from "../core/audit.service";
import { RbacService } from "../core/rbac.service";
import { SemanticLayer } from "../semantic/semanticLayer";
import { SessionService } from "../core/session.service";
import type { QueryResult, Warehouse } from "../warehouse/warehouse.interface";
import { AdminGuard, type AuthedRequest } from "../auth/auth.guard";
import { USERS_MESSAGES } from "./users.constants";
import { UsersController } from "./users.controller";

process.env.BCRYPT_ROUNDS = "4";

const pool = createPool();
const db = createDb(pool);
const sessions = new SessionService(db);
const rbac = new RbacService(db, makeUsersTestWarehouse(), new SemanticLayer());
const audit = new AuditService(db);
const controller = new UsersController(db, rbac, sessions, audit);
const actor = makeAdminActor("00000000-0000-4000-8000-000000000201");
const createdEmails: string[] = [];
let counter = 0;

after(async () => {
  await db.delete(auditEvents).where(eq(auditEvents.userId, actor.id));
  for (const email of createdEmails) {
    await db.delete(users).where(eq(users.email, email));
  }
  await pool.end();
});

test("create then list returns email admin user view without password fields", async () => {
  const email = uniqueEmail();
  const created = await createViaController(email, ["analyst"], [
    { attribute: "state", value: "NSW" },
  ]);

  const user = (await controller.list()).find((u) => u.id === created.id);

  assert.ok(user);
  assert.equal(user.email, email);
  assert.equal(user.display_name, "Test User");
  assert.equal(user.is_active, true);
  assert.deepEqual(user.roles, ["analyst"]);
  assert.deepEqual(user.scope, [{ attribute: "state", value: "NSW" }]);
  assert.equal("passwordHash" in (user as unknown as Record<string, unknown>), false);
  assert.equal("mustReset" in (user as unknown as Record<string, unknown>), false);
  assert.deepEqual(await latestAdminEvent(), {
    action: "user.create",
    target: { type: "user", id: created.id },
    detail: { email, roles: ["analyst"], scopeCount: 1 },
  });
});

test("patch replaces roles and scope, and is_active=false revokes refresh tokens", async () => {
  const email = uniqueEmail();
  const { id } = await createViaController(email, ["analyst"], [
    { attribute: "state", value: "NSW" },
  ]);
  const token = await sessions.create(id);
  assert.ok(await sessions.rotate(token.refreshToken));

  const secondToken = await sessions.create(id);
  const roleUpdated = await controller.update(id, { roles: ["manager"] }, actor);
  assert.deepEqual(roleUpdated.roles, ["manager"]);
  assert.deepEqual(await latestAdminEvent(), {
    action: "user.update",
    target: { type: "user", id },
    detail: { changedFields: ["roles"], roleCount: 1 },
  });

  const scopeUpdated = await controller.update(
    id,
    {
      scope: [{ attribute: "serviceability", value: "serviceable" }],
    },
    actor,
  );
  assert.deepEqual(scopeUpdated.scope, [
    { attribute: "serviceability", value: "serviceable" },
  ]);

  const deactivated = await controller.update(id, { is_active: false }, actor);
  assert.equal(deactivated.is_active, false);
  assert.equal(await sessions.rotate(secondToken.refreshToken), null);
});

test("deactivate revokes all refresh tokens and inactive users resolve fail-closed", async () => {
  const email = uniqueEmail();
  const { id } = await createViaController(email, ["analyst"], []);
  const first = await sessions.create(id);
  const second = await sessions.create(id);

  assert.deepEqual(await controller.deactivate(id, actor), { ok: true });
  assert.deepEqual(await latestAdminEvent(), {
    action: "user.deactivate",
    target: { type: "user", id },
    detail: { isActive: false, sessionsRevoked: true },
  });
  assert.deepEqual(await controller.deactivate(id, actor), { ok: true });

  assert.equal(await sessions.rotate(first.refreshToken), null);
  assert.equal(await sessions.rotate(second.refreshToken), null);
  assert.equal(await rbac.resolveUser(id), null);
});

test("duplicate email returns 409 and does not create a second row", async () => {
  const email = uniqueEmail();
  await createViaController(email, ["analyst"], []);
  const auditCountBefore = await countAdminEvents();

  const error = await captureHttpException(() =>
    controller.create(
      {
        email,
        display_name: "Test User",
        roles: ["analyst"],
        scope: [],
      },
      actor,
    ),
  );

  assert.equal(error.status, 409);
  assert.equal(await countUsers(email), 1);
  assert.equal(await countAdminEvents(), auditCountBefore);
});

test("create with a non-existent role errors and rolls back the user row", async () => {
  const email = uniqueEmail();

  const error = await captureHttpException(() =>
    controller.create(
      {
        email,
        display_name: "Test User",
        roles: ["role-that-does-not-exist"],
        scope: [],
      },
      actor,
    ),
  );

  assert.ok(error.status === 400 || error.status === 409);
  assert.equal(await countUsers(email), 0);
});

test("create rolls back the user row when the audit write fails", async () => {
  const email = uniqueEmail();
  const failingController = new UsersController(
    db,
    rbac,
    sessions,
    failingAuditService(),
  );

  const error = await captureHttpException(() =>
    failingController.create(
      {
        email,
        display_name: "Test User",
        roles: ["analyst"],
        scope: [],
      },
      actor,
    ),
  );

  assert.deepEqual(error, { status: 500, message: USERS_MESSAGES.internalError });
  assert.equal(await countUsers(email), 0);
});

test("create with an unknown scope value returns 400", async () => {
  const email = uniqueEmail();

  const error = await captureHttpException(() =>
    controller.create(
      {
        email,
        display_name: "Test User",
        roles: ["analyst"],
        scope: [{ attribute: "state", value: "not-a-state" }],
      },
      actor,
    ),
  );

  assert.equal(error.status, 400);
  assert.equal(await countUsers(email), 0);
});

test("patch with a non-existent role errors and preserves existing roles", async () => {
  const email = uniqueEmail();
  const { id } = await createViaController(email, ["analyst"], []);

  const error = await captureHttpException(() =>
    controller.update(id, { roles: ["role-that-does-not-exist"] }, actor),
  );

  assert.ok(error.status === 400 || error.status === 409);
  const user = (await controller.list()).find((u) => u.id === id);
  assert.ok(user);
  assert.deepEqual(user.roles, ["analyst"]);
});

test("patch with an unknown scope value keeps the safe validation 400", async () => {
  const email = uniqueEmail();
  const { id } = await createViaController(email, ["analyst"], []);

  const error = await captureHttpException(() =>
    controller.update(
      id,
      { scope: [{ attribute: "state", value: "not-a-state" }] },
      actor,
    ),
  );

  assert.equal(error.status, 400);
});

test("deactivate preserves an active user when the audit write fails", async () => {
  const email = uniqueEmail();
  const { id } = await createViaController(email, ["analyst"], []);
  const failingController = new UsersController(
    db,
    rbac,
    sessions,
    failingAuditService(),
  );

  const error = await captureHttpException(() => failingController.deactivate(id, actor));

  assert.deepEqual(error, { status: 500, message: USERS_MESSAGES.internalError });
  const rows = await db
    .select({ isActive: users.isActive })
    .from(users)
    .where(eq(users.id, id));
  assert.deepEqual(rows, [{ isActive: true }]);
});

test("deactivate rolls back the active flag and audit when session revocation fails", async () => {
  const email = uniqueEmail();
  const { id } = await createViaController(email, ["analyst"], []);
  const auditCountBefore = await countAdminEvents();
  const failingController = new UsersController(
    db,
    rbac,
    failingSessionService(),
    audit,
  );

  const error = await captureHttpException(() => failingController.deactivate(id, actor));

  assert.deepEqual(error, { status: 500, message: USERS_MESSAGES.internalError });
  const rows = await db
    .select({ isActive: users.isActive })
    .from(users)
    .where(eq(users.id, id));
  assert.deepEqual(rows, [{ isActive: true }]);
  assert.equal(await countAdminEvents(), auditCountBefore);
});

test("patch deactivation rolls back the active flag and audit when session revocation fails", async () => {
  const email = uniqueEmail();
  const { id } = await createViaController(email, ["analyst"], []);
  const auditCountBefore = await countAdminEvents();
  const failingController = new UsersController(
    db,
    rbac,
    failingSessionService(),
    audit,
  );

  const error = await captureHttpException(() =>
    failingController.update(id, { is_active: false }, actor),
  );

  assert.deepEqual(error, { status: 500, message: USERS_MESSAGES.internalError });
  const rows = await db
    .select({ isActive: users.isActive })
    .from(users)
    .where(eq(users.id, id));
  assert.deepEqual(rows, [{ isActive: true }]);
  assert.equal(await countAdminEvents(), auditCountBefore);
});

test("AdminGuard rejects a non-admin principal with 403", () => {
  const guard = new AdminGuard();
  const req = {
    authUser: {
      id: "user-id",
      email: "non-admin@example.com",
      display_name: "non-admin",
      is_active: true,
      roles: ["analyst"],
      permissions: { domains: [], measureIds: [], dimensionIds: [], actions: ["save"] },
      scope: [],
    },
  } as unknown as AuthedRequest;

  assert.throws(
    () => guard.canActivate(makeContext(req)),
    (err: unknown) => err instanceof HttpException && err.getStatus() === 403,
  );
});

async function createViaController(
  email: string,
  roles: string[],
  scope: Array<{ attribute: string; value: string }>,
): Promise<{ id: string }> {
  const created = await controller.create(
    { email, display_name: "Test User", roles, scope },
    actor,
  );
  createdEmails.push(email);
  return created;
}

function uniqueEmail(): string {
  counter += 1;
  return `a2b_users_test_${Date.now()}_${counter}@example.com`;
}

async function countUsers(email: string): Promise<number> {
  const rows = await db.select({ count: count() }).from(users).where(eq(users.email, email));
  return Number(rows[0].count);
}

async function countAdminEvents(): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(auditEvents)
    .where(eq(auditEvents.userId, actor.id));
  return Number(rows[0].count);
}

async function latestAdminEvent(): Promise<{
  action: string;
  target: unknown;
  detail: unknown;
}> {
  const rows = await db
    .select({ selection: auditEvents.selection })
    .from(auditEvents)
    .where(eq(auditEvents.userId, actor.id))
    .orderBy(desc(auditEvents.id))
    .limit(1);
  assert.equal(rows.length, 1);
  return rows[0].selection as {
    action: string;
    target: unknown;
    detail: unknown;
  };
}

function makeContext(req: AuthedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
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

function makeUsersTestWarehouse(): Warehouse {
  return {
    async explain(_sql: string): Promise<void> {},
    async execute(_sql: string): Promise<QueryResult> {
      return { columns: [], rows: [] };
    },
    async freshness(_goldObject: string): Promise<string | null> {
      return null;
    },
    async distinctValues(_goldObject: string, column: string): Promise<string[]> {
      if (column === "state") return ["NSW"];
      if (column === "serviceable_pincode") return ["serviceable"];
      return [];
    },
  };
}

function failingAuditService(): AuditService {
  return {
    async writeAdminEvent() {
      throw new Error("audit write failed");
    },
  } as unknown as AuditService;
}

function failingSessionService(): SessionService {
  return {
    async deleteAllForUser() {
      throw new Error("session revocation failed");
    },
  } as unknown as SessionService;
}

function makeAdminActor(id: string): AuthUser {
  return {
    id,
    email: "users-audit-admin@example.com",
    display_name: "Users Audit Admin",
    is_active: true,
    roles: ["admin"],
    permissions: {
      domains: [],
      measureIds: [],
      dimensionIds: [],
      actions: ["admin"],
    },
    scope: [],
  };
}
