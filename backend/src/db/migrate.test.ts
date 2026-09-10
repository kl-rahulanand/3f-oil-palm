import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, count, eq } from "drizzle-orm";
import { DEFAULT_SEED_USERS, loadConfig } from "../config";
import { createDb, createPool } from "./pool";
import { otpCodes, refreshTokens, roles, userRoles, users } from "./schema";
import { baseRolePerms, seedConfiguredUsers } from "./migrate";

const pool = createPool();
const db = createDb(pool);
const createdEmails: string[] = [];
let counter = 0;

after(async () => {
  await cleanup();
  await pool.end();
});

test("default SEED_USERS is a placeholder email-based admin", () => {
  const original = process.env.SEED_USERS;
  delete process.env.SEED_USERS;

  try {
    const cfg = loadConfig();
    assert.equal(DEFAULT_SEED_USERS, "admin@example.invalid|3F Admin|admin");
    assert.deepEqual(cfg.seedUsers, [{ email: "admin@example.invalid", displayName: "3F Admin", roles: ["admin"] }]);
  } finally {
    if (original === undefined) delete process.env.SEED_USERS;
    else process.env.SEED_USERS = original;
  }
});

test("base roles contain framework actions but no domain grants", () => {
  const adminGrants = baseRolePerms.filter((grant) => grant.role === "admin");

  assert.equal(
    baseRolePerms.some((grant) => grant.grantType === "domain"),
    false,
  );
  assert.equal(
    baseRolePerms.some((grant) => grant.grantType === "measure"),
    false,
  );
  assert.equal(
    baseRolePerms.some((grant) => grant.grantType === "dimension"),
    false,
  );
  assert.ok(adminGrants.some((grant) => grant.grantType === "action" && grant.grantId === "save"));
  assert.ok(adminGrants.some((grant) => grant.grantType === "action" && grant.grantId === "pin"));
  assert.ok(adminGrants.some((grant) => grant.grantType === "action" && grant.grantId === "report"));
});

test("DBA role is separate from analyst and receives framework action grants", () => {
  const dbaGrants = baseRolePerms.filter((grant) => grant.role === "dba");
  assert.ok(dbaGrants.some((grant) => grant.grantType === "action" && grant.grantId === "save"));
});

test("seedConfiguredUsers creates and updates managed email users idempotently", async () => {
  const email = uniqueEmail();
  createdEmails.push(email);

  await db.insert(roles).values({ name: "analyst", label: "Analyst / DBA" }).onConflictDoNothing();

  try {
    assert.equal(await seedConfiguredUsers(db, [{ email, displayName: "Initial Analyst", roles: ["analyst"] }]), 1);

    let user = await getSeededUser(email);
    assert.ok(user);
    assert.equal(user.displayName, "Initial Analyst");
    assert.equal(user.isActive, true);
    assert.equal(await countUsers(email), 1);
    assert.equal(await countUserRoles(user.id, "analyst"), 1);

    assert.equal(await seedConfiguredUsers(db, [{ email, displayName: "Initial Analyst", roles: ["analyst"] }]), 1);
    assert.equal(await countUsers(email), 1);
    assert.equal(await countUserRoles(user.id, "analyst"), 1);

    await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));
    assert.equal(await seedConfiguredUsers(db, [{ email, displayName: "Updated Analyst", roles: ["analyst"] }]), 1);

    user = await getSeededUser(email);
    assert.ok(user);
    assert.equal(user.displayName, "Updated Analyst");
    assert.equal(user.isActive, true);
    assert.equal(await countUsers(email), 1);
    assert.equal(await countUserRoles(user.id, "analyst"), 1);
  } finally {
    await cleanup();
  }
});

test("otp_codes and refresh_tokens accept hashed auth rows", async () => {
  const email = uniqueEmail();
  createdEmails.push(email);

  const inserted = await db
    .insert(users)
    .values({ email, displayName: "Token Test", isActive: true })
    .returning({ id: users.id });
  const userId = inserted[0].id;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  const otp = await db
    .insert(otpCodes)
    .values({
      userId,
      codeHash: "sha256:otp-hash-only",
      expiresAt,
    })
    .returning({ id: otpCodes.id, attempts: otpCodes.attempts });

  const refresh = await db
    .insert(refreshTokens)
    .values({
      userId,
      jti: `jti-${Date.now()}-${counter}`,
      tokenHash: "sha256:refresh-token-hash-only",
      expiresAt,
      ua: "node:test",
      ip: "127.0.0.1",
    })
    .returning({ id: refreshTokens.id });

  assert.ok(otp[0].id);
  assert.equal(otp[0].attempts, 0);
  assert.ok(refresh[0].id);
});

function uniqueEmail(): string {
  counter += 1;
  return `seed-users-test-${Date.now()}-${counter}@example.invalid`;
}

async function getSeededUser(email: string): Promise<{
  id: string;
  displayName: string;
  isActive: boolean;
} | null> {
  const rows = await db
    .select({ id: users.id, displayName: users.displayName, isActive: users.isActive })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return rows[0] ?? null;
}

async function countUsers(email: string): Promise<number> {
  const rows = await db.select({ count: count() }).from(users).where(eq(users.email, email));
  return Number(rows[0].count);
}

async function countUserRoles(userId: string, role: string): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.role, role)));
  return Number(rows[0].count);
}

async function cleanup(): Promise<void> {
  for (const email of createdEmails) {
    await db.delete(users).where(eq(users.email, email));
  }
}
