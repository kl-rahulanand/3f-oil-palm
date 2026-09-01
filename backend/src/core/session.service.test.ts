import "reflect-metadata";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq, isNull, sql } from "drizzle-orm";
import { createDb, createPool } from "../db/pool";
import { refreshTokens, sessions, users } from "../db/schema";
import { SessionService } from "./session.service";

process.env.SESSION_SWEEP_INTERVAL_MS = "0";
process.env.BCRYPT_ROUNDS = "4";

const pool = createPool();
const db = createDb(pool);
const service = new SessionService(db);
const createdEmails: string[] = [];
let counter = 0;

after(async () => {
  for (const email of createdEmails) {
    await db.delete(users).where(eq(users.email, email));
  }
  await pool.end();
});

test("create issues access and refresh JWTs while storing only a refresh hash", async () => {
  const userId = await createUser();
  const tokens = await service.create(userId, { ua: "test-agent", ip: "10.0.0.1" });
  const access = await service.verifyAccess(tokens.accessToken);
  const stored = await db.select().from(refreshTokens).where(eq(refreshTokens.jti, tokens.refreshJti));

  assert.equal(access?.userId, userId);
  assert.equal(access?.sessionId, tokens.sessionId);
  assert.equal(stored.length, 1);
  assert.notEqual(stored[0].tokenHash, tokens.refreshToken);
  assert.equal(stored[0].ua, "test-agent");
  assert.equal(stored[0].ip, "10.0.0.1");
});

test("refresh rotation revokes the old jti and rejects reuse", async () => {
  const userId = await createUser();
  const first = await service.create(userId);
  const rotated = await service.rotate(first.refreshToken);

  assert.ok(rotated);
  assert.equal(rotated.sessionId, first.sessionId);
  assert.notEqual(rotated.refreshToken, first.refreshToken);
  assert.equal(await service.rotate(first.refreshToken), null);

  const oldRows = await db.select().from(refreshTokens).where(eq(refreshTokens.jti, first.refreshJti));
  const liveRows = await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  assert.ok(oldRows[0].revokedAt);
  assert.equal(liveRows.length, 1);
});

test("concurrent rotation of the same refresh token mints exactly one successor", async () => {
  const userId = await createUser();
  const first = await service.create(userId);

  // Fire both rotations before either resolves — the SELECT-then-revoke window
  // is exactly where a non-atomic rotate would let a reused token mint two
  // successors. The conditional revoke must reject all but one.
  const outcomes = await Promise.all([
    service.rotate(first.refreshToken),
    service.rotate(first.refreshToken),
  ]);

  const succeeded = outcomes.filter((o) => o !== null);
  assert.equal(succeeded.length, 1);

  const liveRows = await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  assert.equal(liveRows.length, 1);
});

test("revokeRefreshToken and deleteAllForUser revoke refresh tokens", async () => {
  const userId = await createUser();
  const first = await service.create(userId);
  await service.revokeRefreshToken(first.refreshToken);
  assert.equal(await service.rotate(first.refreshToken), null);

  const second = await service.create(userId);
  const third = await service.create(userId);
  await service.deleteAllForUser(userId);
  assert.equal(await service.rotate(second.refreshToken), null);
  assert.equal(await service.rotate(third.refreshToken), null);
});

test("sweepExpired deletes expired refresh tokens and sessions", async () => {
  const userId = await createUser();
  const tokens = await service.create(userId);
  await db.update(refreshTokens).set({ expiresAt: sql`now() - interval '1 second'` }).where(eq(refreshTokens.jti, tokens.refreshJti));
  await db.update(sessions).set({ expiresAt: sql`now() - interval '1 second'` }).where(eq(sessions.id, tokens.sessionId));

  const deleted = await service.sweepExpired();

  assert.ok(deleted >= 2);
  assert.equal(await service.verifyAccess(tokens.accessToken), null);
});

async function createUser(): Promise<string> {
  counter += 1;
  const email = `session.${Date.now()}.${counter}@example.com`;
  const inserted = await db
    .insert(users)
    .values({ email, displayName: `Session User ${counter}`, isActive: true })
    .returning({ id: users.id });
  createdEmails.push(email);
  return inserted[0].id;
}
