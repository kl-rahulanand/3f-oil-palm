import "reflect-metadata";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { createDb, createPool } from "../db/pool";
import { auditEvents, users } from "../db/schema";
import { UsageService } from "./usage.service";

const pool = createPool();
const db = createDb(pool);
const service = new UsageService(db);
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

test("list aggregates request counts and result token sums by user", async () => {
  const userA = await createUser("usage-a");
  const userB = await createUser("usage-b");
  const outsideWindow = new Date("2026-01-01T00:00:00.000Z");
  const insideOne = new Date("2026-02-01T00:00:00.000Z");
  const insideTwo = new Date("2026-02-02T00:00:00.000Z");

  await db.insert(auditEvents).values([
    { eventType: "request", userId: userA.id, sessionId: randomSession(), ts: insideOne },
    { eventType: "request", userId: userA.id, sessionId: randomSession(), ts: insideTwo },
    {
      eventType: "result",
      userId: userA.id,
      sessionId: randomSession(),
      responseClass: "success",
      ts: insideOne,
      modelId: "model-a",
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    },
    {
      eventType: "result",
      userId: userA.id,
      sessionId: randomSession(),
      responseClass: "success",
      ts: insideTwo,
      modelId: "model-a",
      inputTokens: 7,
      outputTokens: 3,
      totalTokens: 10,
    },
    { eventType: "auth.otp_verified", userId: userA.id, sessionId: randomSession(), ts: insideTwo },
    {
      eventType: "admin.mutation",
      userId: userA.id,
      sessionId: randomSession(),
      ts: insideTwo,
      inputTokens: 999,
      outputTokens: 999,
      totalTokens: 999,
    },
    { eventType: "request", userId: userB.id, sessionId: randomSession(), ts: insideOne },
    {
      eventType: "result",
      userId: userB.id,
      sessionId: randomSession(),
      responseClass: "success",
      ts: insideOne,
      inputTokens: 4,
      outputTokens: 2,
      totalTokens: 6,
    },
    {
      eventType: "result",
      userId: userB.id,
      sessionId: randomSession(),
      responseClass: "success",
      ts: outsideWindow,
      inputTokens: 100,
      outputTokens: 100,
      totalTokens: 200,
    },
  ]);

  const allTime = await service.list();
  const rowA = allTime.find((row) => row.userId === userA.id);
  const rowB = allTime.find((row) => row.userId === userB.id);

  assert.deepEqual(
    {
      email: rowA?.email,
      queryCount: rowA?.queryCount,
      inputTokens: rowA?.inputTokens,
      outputTokens: rowA?.outputTokens,
      totalTokens: rowA?.totalTokens,
      lastActivityAt: rowA?.lastActivityAt,
    },
    {
      email: userA.email,
      queryCount: 2,
      inputTokens: 17,
      outputTokens: 8,
      totalTokens: 25,
      lastActivityAt: insideTwo.toISOString(),
    },
  );
  assert.equal(rowB?.queryCount, 1);
  assert.equal(rowB?.totalTokens, 206);

  const windowed = await service.list({
    from: "2026-02-01T00:00:00.000Z",
    to: "2026-02-28T23:59:59.999Z",
  });
  const windowedCreatedUsers = windowed.filter((row) =>
    [userA.id, userB.id].includes(row.userId),
  );
  const windowedB = windowed.find((row) => row.userId === userB.id);

  assert.equal(windowedB?.totalTokens, 6);
  assert.deepEqual(
    windowedCreatedUsers.map((row) => row.userId),
    [userA.id, userB.id],
  );

  const series = await service.series({
    from: "2026-02-01T00:00:00.000Z",
    to: "2026-02-28T23:59:59.999Z",
    userId: userA.id,
  });
  assert.equal(series.granularity, "day");
  assert.deepEqual(
    series.points.map((point) => ({
      bucketStart: point.bucketStart,
      queryCount: point.queryCount,
      totalTokens: point.totalTokens,
    })),
    [
      { bucketStart: "2026-02-01T00:00:00.000Z", queryCount: 1, totalTokens: 15 },
      { bucketStart: "2026-02-02T00:00:00.000Z", queryCount: 1, totalTokens: 10 },
    ],
  );
});

test("series uses monthly buckets for all-time usage", async () => {
  const series = await service.series();
  assert.equal(series.granularity, "month");
});

async function createUser(label: string): Promise<{ id: string; email: string }> {
  counter += 1;
  const email = `${label}-${Date.now()}-${counter}@example.invalid`;
  const rows = await db
    .insert(users)
    .values({ email, displayName: "Usage Test User", isActive: true })
    .returning({ id: users.id });
  createdEmails.push(email);
  createdUserIds.push(rows[0].id);
  return { id: rows[0].id, email };
}

function randomSession(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${counter.toString().padStart(12, "0")}`;
}
