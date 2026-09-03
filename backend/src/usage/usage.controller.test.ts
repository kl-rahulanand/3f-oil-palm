import "reflect-metadata";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { ExecutionContext, HttpException } from "@nestjs/common";
import type { AuthUser } from "@3f/contract";
import { eq, inArray } from "drizzle-orm";
import { AdminGuard, type AuthedRequest } from "../auth/auth.guard";
import { createDb, createPool } from "../db/pool";
import { auditEvents, users } from "../db/schema";
import { UsageController } from "./usage.controller";
import { UsageService } from "./usage.service";

const pool = createPool();
const db = createDb(pool);
const service = new UsageService(db);
const controller = new UsageController(service);
const createdEmails: string[] = [];
const createdUserIds: string[] = [];
let counter = 0;

after(async () => {
  if (createdUserIds.length > 0) {
    await db.delete(auditEvents).where(inArray(auditEvents.userId, createdUserIds));
  }
  for (const email of createdEmails) {
    await db.delete(users).where(eq(users.email, email));
  }
  await pool.end();
});

test("usage endpoint guard rejects non-admin with 403", () => {
  const guard = new AdminGuard();
  const req = {
    authUser: makeActor("analyst", ["save"]),
  } as unknown as AuthedRequest;

  assert.throws(
    () => guard.canActivate(makeContext(req)),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 403,
  );
});

test("usage endpoint returns rows for an admin principal", async () => {
  const admin = makeActor("admin", ["admin"]);
  assert.equal(new AdminGuard().canActivate(makeContext({ authUser: admin } as AuthedRequest)), true);

  const user = await createUser();
  await db.insert(auditEvents).values([
    {
      eventType: "request",
      userId: user.id,
      sessionId: randomSession(),
      ts: new Date("2026-03-01T00:00:00.000Z"),
    },
    {
      eventType: "result",
      userId: user.id,
      sessionId: randomSession(),
      responseClass: "success",
      ts: new Date("2026-03-01T00:00:01.000Z"),
      inputTokens: 12,
      outputTokens: 8,
      totalTokens: 20,
    },
  ]);

  const rows = await controller.list({});
  const row = rows.find((candidate) => candidate.userId === user.id);

  assert.ok(row);
  assert.equal(row.email, user.email);
  assert.equal(row.queryCount, 1);
  assert.equal(row.totalTokens, 20);

  const series = await controller.series({
    from: "2026-03-01T00:00:00.000Z",
    to: "2026-03-02T00:00:00.000Z",
    userId: user.id,
  });
  assert.equal(series.granularity, "day");
  assert.equal(series.points.length, 1);
  assert.equal(series.points[0].totalTokens, 20);
});

test("usage endpoint rejects malformed query dates", async () => {
  const error = await captureHttpException(() => controller.list({ from: "not-a-date" }));
  assert.equal(error.status, 400);
});

test("usage series endpoint rejects malformed user ids", async () => {
  const error = await captureHttpException(() => controller.series({ userId: "not-a-uuid" }));
  assert.equal(error.status, 400);
});

async function createUser(): Promise<{ id: string; email: string }> {
  counter += 1;
  const email = `usage-controller-${Date.now()}-${counter}@example.invalid`;
  const rows = await db
    .insert(users)
    .values({ email, displayName: "Usage Controller User", isActive: true })
    .returning({ id: users.id });
  createdEmails.push(email);
  createdUserIds.push(rows[0].id);
  return { id: rows[0].id, email };
}

function makeActor(role: string, actions: string[]): AuthUser {
  return {
    id: `00000000-0000-4000-8000-${(++counter).toString().padStart(12, "0")}`,
    email: `${role}@example.invalid`,
    display_name: role,
    is_active: true,
    roles: [role],
    permissions: { domains: [], measureIds: [], dimensionIds: [], actions },
    scope: [],
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
  } catch (error) {
    assert.ok(error instanceof HttpException);
    const response = error.getResponse();
    return {
      status: error.getStatus(),
      message:
        typeof response === "string"
          ? response
          : String((response as { message?: unknown }).message),
    };
  }
  assert.fail("expected HttpException");
}

function randomSession(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${counter.toString().padStart(12, "0")}`;
}
