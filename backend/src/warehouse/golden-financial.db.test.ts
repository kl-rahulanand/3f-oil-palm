import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { AuthUser, Selection, SourcePresence } from "@3f/contract";
import type { Pool } from "pg";
import { SemanticLayer } from "../semantic/semanticLayer";
import { SqlBuilder } from "../sql/sqlBuilder";
import {
  createWarehouseDb,
  createWarehouseWritePool,
  IngestionRepository,
  type MisBudgetInput,
  type SapTransactionInput,
} from "./ingestion.repository";
import { PostgresAdapter } from "./postgres.adapter";
import { migrateWarehouse } from "./warehouse-migrate";

const PERIOD = "2099-10-01";
const FIXTURE_PATH = `${__dirname}/__fixtures__/governed-financial-golden.json`;
const CASE_KEYS = [
  "matched",
  "budgetOnly",
  "actualOnly",
  "duplicateNoFanOut",
  "reloadActiveSwap",
  "percentageEdges",
] as const;

interface GoldenRow {
  glCode: string;
  actual: string;
  budget: string;
  percentage: string | null;
  sourcePresence: SourcePresence;
  budgetComponentLabels: string[];
}

interface GoldenExpectation {
  matched: GoldenRow;
  budgetOnly: GoldenRow;
  actualOnly: GoldenRow;
  duplicateNoFanOut: GoldenRow;
  reloadActiveSwap: { before: GoldenRow; after: GoldenRow };
  percentageEdges: {
    zeroOverZero: GoldenRow;
    positiveOverBudget: GoldenRow;
    negativeActual: GoldenRow;
  };
}

test("the golden financial expectation loader accepts the frozen complete six case fixture", () => {
  const fixture = loadGoldenExpectation(FIXTURE_PATH);
  assert.deepEqual(Object.keys(fixture), CASE_KEYS);
});

test("the golden financial expectation loader rejects malformed money percentage labels and incomplete case sets", () => {
  const valid = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  for (const invalid of [
    { ...valid, matched: { ...valid.matched, actual: "1.2" } },
    { ...valid, matched: { ...valid.matched, percentage: "125%" } },
    { ...valid, matched: { ...valid.matched, budgetComponentLabels: ["Labour", "Admin"] } },
    Object.fromEntries(Object.entries(valid).filter(([key]) => key !== "percentageEdges")),
  ]) {
    assert.throws(() => parseGoldenExpectation(JSON.stringify(invalid)), /Invalid golden financial fixture/);
  }
});

test("the destructive golden financial proof refuses a non-local warehouse host", () => {
  assert.throws(() => assertLocalWarehouseHost("warehouse.shared.example"), /refuses a non-local warehouse/);
});

test(
  "WAREHOUSE_DB_TEST proves the frozen governed financial golden answers and in query provenance for matched Budget only Actual only duplicate no fan out reload active swap and percentage edge cases",
  { skip: process.env.WAREHOUSE_DB_TEST !== "1" },
  async () => {
    assertLocalWarehouseHost(process.env.WAREHOUSE_PG_HOST);
    await migrateWarehouse();
    const pool = await createWarehouseWritePool();
    try {
      await pool.query("TRUNCATE sap_transaction, mis_budget, ingest_batch CASCADE");
      const fixture = loadGoldenExpectation(FIXTURE_PATH);
      const repository = new IngestionRepository(createWarehouseDb(pool));
      const actualBatchId = await repository.replaceActualsBatch(metadata("actuals"), actualRows());
      const firstBudgetBatchId = await repository.replaceBudgetBatch(metadata("budget-before"), budgetRows("200.00"));
      const before = await executeGoldenQuery(pool);

      assertGoldenRow(before.adapterRows, fixture.matched, actualBatchId, firstBudgetBatchId);
      assertGoldenRow(before.adapterRows, fixture.budgetOnly, actualBatchId, firstBudgetBatchId);
      assertGoldenRow(before.adapterRows, fixture.actualOnly, actualBatchId, firstBudgetBatchId);
      assertGoldenRow(before.adapterRows, fixture.duplicateNoFanOut, actualBatchId, firstBudgetBatchId);
      assert.equal(before.adapterRows.filter((row) => row.gl_code === fixture.duplicateNoFanOut.glCode).length, 1);
      assertGoldenRow(before.adapterRows, fixture.reloadActiveSwap.before, actualBatchId, firstBudgetBatchId);
      for (const expected of Object.values(fixture.percentageEdges)) {
        assertGoldenRow(before.adapterRows, expected, actualBatchId, firstBudgetBatchId);
      }
      assertRawProvenance(before.rawRows, fixture, actualBatchId, firstBudgetBatchId);

      const actualsBeforeReload = await activeActuals(pool);
      const secondBudgetBatchId = await repository.replaceBudgetBatch(metadata("budget-after"), budgetRows("250.00"));
      const after = await executeGoldenQuery(pool);

      assertGoldenRow(after.adapterRows, fixture.reloadActiveSwap.after, actualBatchId, secondBudgetBatchId);
      assert.notEqual(fixture.reloadActiveSwap.before.budget, fixture.reloadActiveSwap.after.budget);
      assert.deepEqual(await activeActuals(pool), actualsBeforeReload);
      await assertBatchState(pool, firstBudgetBatchId, false);
      await assertBatchState(pool, secondBudgetBatchId, true);
      await assertBatchState(pool, actualBatchId, true);
      assertRawRow(after.rawRows, fixture.reloadActiveSwap.after, actualBatchId, secondBudgetBatchId);
    } finally {
      await pool.end();
    }
  },
);

export function loadGoldenExpectation(path: string): GoldenExpectation {
  return parseGoldenExpectation(readFileSync(path, "utf8"));
}

export function parseGoldenExpectation(json: string): GoldenExpectation {
  const value: unknown = JSON.parse(json);
  if (!isRecord(value) || !sameStrings(Object.keys(value), CASE_KEYS)) invalidFixture();
  const fixture = value as Record<string, unknown>;
  for (const key of ["matched", "budgetOnly", "actualOnly", "duplicateNoFanOut"]) assertGoldenFixtureRow(fixture[key]);
  if (!isRecord(fixture.reloadActiveSwap) || !sameStrings(Object.keys(fixture.reloadActiveSwap), ["before", "after"]))
    invalidFixture();
  assertGoldenFixtureRow(fixture.reloadActiveSwap.before);
  assertGoldenFixtureRow(fixture.reloadActiveSwap.after);
  if (
    !isRecord(fixture.percentageEdges) ||
    !sameStrings(Object.keys(fixture.percentageEdges), ["zeroOverZero", "positiveOverBudget", "negativeActual"])
  )
    invalidFixture();
  for (const row of Object.values(fixture.percentageEdges)) assertGoldenFixtureRow(row);
  return value as unknown as GoldenExpectation;
}

function assertGoldenFixtureRow(value: unknown): asserts value is GoldenRow {
  if (
    !isRecord(value) ||
    !sameStrings(Object.keys(value), [
      "glCode",
      "actual",
      "budget",
      "percentage",
      "sourcePresence",
      "budgetComponentLabels",
    ])
  )
    invalidFixture();
  const labels = value.budgetComponentLabels;
  if (
    typeof value.glCode !== "string" ||
    !money(value.actual) ||
    !money(value.budget) ||
    !percentage(value.percentage) ||
    !["matched", "budget-only", "actual-only"].includes(String(value.sourcePresence)) ||
    !Array.isArray(labels) ||
    !labels.every((label) => typeof label === "string") ||
    !sameStrings(labels, [...new Set(labels)].sort())
  )
    invalidFixture();
}

function money(value: unknown): value is string {
  return typeof value === "string" && /^-?\d+\.\d{2}$/.test(value);
}

function percentage(value: unknown): value is string | null {
  return (
    value === null ||
    value === "over-budget" ||
    value === "credit / negative actual" ||
    (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value))
  );
}

function invalidFixture(): never {
  throw new Error("Invalid golden financial fixture");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sameStrings(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

async function executeGoldenQuery(pool: Pool) {
  const domain = new SemanticLayer().domain("governed-financial");
  assert.ok(domain);
  const selection: Selection = {
    domain: domain.name,
    measureIds: domain.measures.map(({ id }) => id),
    dimensionIds: domain.dimensions.map(({ id }) => id),
    filters: [],
  };
  const built = new SqlBuilder().build(domain, selection, user);
  const adapterRows = (await new PostgresAdapter().execute(built.sql)).rows;
  const rawRows = (await pool.query<RawGoldenRow>(built.sql.replace(/\nLIMIT \d+$/, "\nLIMIT 1000"))).rows;
  return { adapterRows, rawRows };
}

function assertGoldenRow(
  rows: Array<Record<string, string | number | null>>,
  expected: GoldenRow,
  actualBatchId: string,
  budgetBatchId: string,
): void {
  const row = rows.find((candidate) => candidate.gl_code === expected.glCode);
  assert.ok(row, `missing ${expected.glCode}`);
  assert.deepEqual(
    {
      actual: row.actual,
      budget: row.budget,
      percentage: row.percentage,
      sourcePresence: parseJsonValues(row.source_presence)[0],
      budgetComponentLabels: parseJsonValues(row.budget_component_labels).filter(isString),
    },
    {
      actual: expected.actual,
      budget: expected.budget,
      percentage: expected.percentage,
      sourcePresence: expected.sourcePresence,
      budgetComponentLabels: expected.budgetComponentLabels,
    },
  );
  assertBatchIds(row.active_batch_ids, actualBatchId, budgetBatchId);
}

interface RawGoldenRow {
  gl_code: string;
  source_presence: string;
  budget_component_labels: string | null;
  active_batch_ids: string;
}

function assertRawProvenance(
  rows: RawGoldenRow[],
  fixture: GoldenExpectation,
  actualBatchId: string,
  budgetBatchId: string,
): void {
  for (const expected of [
    fixture.matched,
    fixture.budgetOnly,
    fixture.actualOnly,
    fixture.duplicateNoFanOut,
    ...Object.values(fixture.percentageEdges),
  ])
    assertRawRow(rows, expected, actualBatchId, budgetBatchId);
}

function assertRawRow(rows: RawGoldenRow[], expected: GoldenRow, actualBatchId: string, budgetBatchId: string): void {
  const row = rows.find((candidate) => candidate.gl_code === expected.glCode);
  assert.ok(row, `missing raw ${expected.glCode}`);
  assert.deepEqual(parseJsonValues(row.budget_component_labels).filter(isString), expected.budgetComponentLabels);
  assert.equal(parseJsonValues(row.source_presence)[0], expected.sourcePresence);
  assertBatchIds(row.active_batch_ids, actualBatchId, budgetBatchId);
}

function assertBatchIds(value: string | number | null, actualBatchId: string, budgetBatchId: string): void {
  assert.deepEqual(parseJsonValues(value), [
    { source: "actuals", period: PERIOD, batchId: actualBatchId },
    { source: "budget", period: PERIOD, batchId: budgetBatchId },
  ]);
}

function parseJsonValues(value: string | number | null): unknown[] {
  if (typeof value !== "string") return [];
  const parsed: unknown = JSON.parse(value);
  return flatten(parsed);
}

function flatten(value: unknown): unknown[] {
  return Array.isArray(value) ? value.flatMap(flatten) : [value];
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function metadata(fixture: string) {
  return {
    period: PERIOD,
    uploadedBy: "golden-financial-proof",
    validationResult: { valid: true },
    reconciliationResult: { fixture },
  };
}

function actualRows(): SapTransactionInput[] {
  return [
    actualRow("M1", "Admin", "100.00", "0.00", "MATCHED"),
    actualRow("M2", "Labour", "25.00", "0.00", "MATCHED"),
    actualRow("A1", "Only", "50.00", "0.00", "ACTUAL-ONLY"),
    actualRow("D1", "North", "100.00", "0.00", "MULTI-COST-CENTRE"),
    actualRow("D2", "South", "30.00", "5.00", "MULTI-COST-CENTRE"),
    actualRow("Z1", "Zero", "0.00", "0.00", "PCT-ZERO"),
    actualRow("P1", "Positive", "50.00", "0.00", "PCT-POSITIVE"),
    actualRow("N1", "Negative", "0.00", "50.00", "PCT-NEGATIVE"),
  ];
}

function budgetRows(matchedBudget: string): MisBudgetInput[] {
  return [
    budgetRow("M1", "Admin", "150.00", "MATCHED"),
    budgetRow("M2", "Labour", matchedBudget === "200.00" ? "50.00" : "100.00", "MATCHED"),
    budgetRow("B1", "Budget", "300.00", "BUDGET-ONLY"),
    budgetRow("D1", "Field", "100.00", "MULTI-COST-CENTRE"),
    budgetRow("D2", "Workshop", "150.00", "MULTI-COST-CENTRE"),
    budgetRow("Z1", "Zero", "0.00", "PCT-ZERO"),
  ];
}

function actualRow(
  txnNo: string,
  costCenter: string,
  debit: string,
  credit: string,
  glCode: string,
): SapTransactionInput {
  return {
    txnNo,
    lineId: "1",
    postingDate: "2099-10-07",
    month: PERIOD,
    plant: "DUB",
    plantSrc: "DUB-NUR",
    costCenter,
    glCode,
    acctName: "Golden financial proof",
    debit,
    credit,
  };
}

function budgetRow(lineId: string, costCenter: string, budgetAmount: string, glCode: string): MisBudgetInput {
  return {
    formatId: "nursery",
    period: PERIOD,
    lineId,
    glCode,
    costCenter,
    budgetAmount,
    rolloverAmount: "0.00",
  };
}

function assertLocalWarehouseHost(host: string | undefined): void {
  assert.ok(
    host === "127.0.0.1" || host === "::1" || host === "localhost",
    "WAREHOUSE_DB_TEST refuses a non-local warehouse before destructive golden financial setup",
  );
}

async function activeActuals(pool: Pool) {
  return (
    await pool.query(
      "SELECT txn_no, line_id, debit::text, credit::text FROM sap_transaction txn JOIN ingest_batch batch ON batch.id = txn.batch_id WHERE batch.source_kind = 'actuals' AND batch.is_active ORDER BY txn_no, line_id",
    )
  ).rows;
}

async function assertBatchState(pool: Pool, id: string, isActive: boolean): Promise<void> {
  const result = await pool.query<{ id: string; is_active: boolean }>(
    "SELECT id, is_active FROM ingest_batch WHERE id = $1::uuid",
    [id],
  );
  assert.deepEqual(result.rows, [{ id, is_active: isActive }]);
}

const user: AuthUser = {
  id: "proof-user",
  email: "proof@example.com",
  display_name: "Proof",
  is_active: true,
  roles: ["admin"],
  permissions: { domains: [], measureIds: [], dimensionIds: [], actions: [] },
  scope: [{ attribute: "plant", value: "DUB" }],
};
