// Idempotent migration: apply Drizzle migrations, seed base roles, and seed
// configured email-based users. Run: npm run db:migrate
import { join } from "path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { AppDb } from "./pool";
import { createDb, createPool } from "./pool";
import { rolePerms, roles, userRoles, users, userScope } from "./schema";
import { loadConfig } from "../config";

const baseRoles = [
  { name: "admin", label: "Administrator" },
  { name: "analyst", label: "Analyst" },
  { name: "dba", label: "Database Administrator" },
  { name: "manager", label: "Manager" },
];

export const baseRolePerms = [
  { role: "admin", grantType: "action", grantId: "admin" },
  { role: "admin", grantType: "action", grantId: "save" },
  { role: "admin", grantType: "action", grantId: "pin" },
  { role: "admin", grantType: "action", grantId: "ingest" },
  { role: "admin", grantType: "action", grantId: "report" },
  { role: "admin", grantType: "domain", grantId: "governed-financial" },
  { role: "admin", grantType: "measure", grantId: "governed-financial.actual" },
  { role: "admin", grantType: "measure", grantId: "governed-financial.budget" },
  { role: "admin", grantType: "measure", grantId: "governed-financial.percentage" },
  { role: "admin", grantType: "dimension", grantId: "gl_code" },
  { role: "admin", grantType: "dimension", grantId: "month" },
  { role: "admin", grantType: "domain", grantId: "mis-statement" },
  { role: "admin", grantType: "measure", grantId: "mis-statement.actual_net" },
  { role: "admin", grantType: "measure", grantId: "mis-statement.budget_net" },
  { role: "admin", grantType: "measure", grantId: "mis-statement.rollover_net" },
  { role: "admin", grantType: "measure", grantId: "mis-statement.percentage" },
  { role: "admin", grantType: "dimension", grantId: "leaf_key" },
  { role: "analyst", grantType: "action", grantId: "save" },
  { role: "analyst", grantType: "action", grantId: "pin" },
  { role: "dba", grantType: "action", grantId: "save" },
  { role: "dba", grantType: "action", grantId: "pin" },
  { role: "manager", grantType: "action", grantId: "pin" },
];

export async function seedConfiguredUsers(
  db: AppDb,
  seedUsers: Array<{ email: string; displayName: string; roles: string[] }>,
): Promise<number> {
  for (const seedUser of seedUsers) {
    const email = seedUser.email.trim().toLowerCase();
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

    const userId =
      existing[0]?.id ??
      (
        await db
          .insert(users)
          .values({
            email,
            displayName: seedUser.displayName,
            isActive: true,
          })
          .returning({ id: users.id })
      )[0].id;

    if (existing[0]) {
      await db.update(users).set({ displayName: seedUser.displayName, isActive: true }).where(eq(users.id, userId));
    }

    for (const role of seedUser.roles) {
      await db.insert(userRoles).values({ userId, role }).onConflictDoNothing();
    }
    if (seedUser.roles.includes("admin")) {
      // The MIS statement is scoped to ONE selector set, so statementRequest requires exactly
      // one department, one function and one plant on the signed-in user. Granting only the
      // plant left every statement question unanswerable from Ask. These are the canonical
      // values in mis-mapping-master, i.e. the same triple the MIS Reports dropdowns resolve.
      for (const [attribute, value] of [
        ["department", "Agriculture"],
        ["function", "Nursery"],
        ["plant", "DUB"],
      ] as const) {
        await db.insert(userScope).values({ userId, attribute, value }).onConflictDoNothing();
      }
    }
  }

  return seedUsers.length;
}

async function main() {
  const cfg = loadConfig();
  const pool = createPool();
  const db = createDb(pool);

  try {
    await migrate(db, { migrationsFolder: join(__dirname, "../../drizzle") });

    // Base roles.
    await db.insert(roles).values(baseRoles).onConflictDoNothing();

    // Seed framework action grants; domain grants arrive with each domain.
    await db.insert(rolePerms).values(baseRolePerms).onConflictDoNothing();

    const seededCount = await seedConfiguredUsers(db, cfg.seedUsers);
    if (seededCount) console.log(`Seeded/updated ${seededCount} configured user(s).`);

    console.log("Migration complete.");
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}
