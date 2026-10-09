import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Workbook } from "exceljs";
import type { Pool } from "pg";
import { parseFinancialLoadArguments, loadFinancialWorkbookIntoPool } from "./financial-load.cli";
import { FINANCIAL_MAPPING_SEED } from "./financial-mapping.seed";
import {
  loadFinancialWorkbook,
  type FinancialLoadReferences,
  type FinancialLoadReport,
  type FinancialReferenceSource,
} from "./financial-loader";
import type { FinancialGenerationInput } from "./financial-load.repository";
import { createWarehouseWritePool } from "../warehouse/ingestion.repository";
import { migrateWarehouse } from "../warehouse/warehouse-migrate";

test("the operator CLI preserves a quoted workbook path containing spaces and parentheses", () => {
  assert.deepEqual(
    parseFinancialLoadArguments([
      "--file",
      "/tmp/Financial source (approved)/5 Months Financial Data (1).xlsx",
      "--budget-owner",
      "DUB",
      "--actor",
      "finance.operator",
    ]),
    {
      filePath: "/tmp/Financial source (approved)/5 Months Financial Data (1).xlsx",
      budgetOwner: "DUB",
      importingActor: "finance.operator",
    },
  );
});

test("the workbook load reconciles source sums and activates with exact source-month evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "financial load (spaced) "));
  const filePath = join(directory, "5 Months Financial Data (1).xlsx");
  try {
    await createWorkbook(filePath, { budgetMonth: new Date(Date.UTC(2026, 4, 1)) });
    let activatedInput: FinancialGenerationInput | undefined;
    let referencesPrepared = false;
    const report = await loadFinancialWorkbook(
      { filePath, budgetOwner: "DUB", importingActor: "finance.operator", isSynthetic: true },
      {
        prepareReferences: async (source: FinancialReferenceSource) => {
          referencesPrepared = true;
          assert.ok(source.costCenters.some(({ code }) => code === "Unmapped CC"));
          assert.equal(source.glAccounts.filter(({ code }) => code === "99999999").at(-1)?.name, "Unmapped source GL");
          return referenceData();
        },
        activateGeneration: async (input) => {
          activatedInput = input;
          return { batchId: "batch-1", activated: true, idempotent: false };
        },
      },
    );

    assert.equal(referencesPrepared, true, "governed references must be prepared after source validation");
    assert.ok(activatedInput, "the reconciled generation must reach atomic activation");
    const sourceChecksumSha256 = sha256(await readFile(filePath));
    assert.deepEqual(report, expectedReport(sourceChecksumSha256));
    assert.deepEqual(activatedInput.metadata.sourceReportingMonths, ["2026-04-01", "2026-05-01", "2026-06-01"]);
    assert.deepEqual(activatedInput.metadata.actualCoverage, [
      { plantId: "plant-dub", month: "2026-04-01", completeness: "unconfirmed" },
      { plantId: "plant-dub", month: "2026-06-01", completeness: "unconfirmed" },
    ]);
    assert.deepEqual(activatedInput.metadata.budgetCoverage, [
      { plantId: "plant-dub", month: "2026-05-01", completeness: "confirmed" },
    ]);
    assert.deepEqual(activatedInput.metadata.reconciliationResult, {
      reconciled: true,
      actualByMonth: {
        "2026-04-01": {
          rowCount: 2,
          debit: "13.01",
          credit: "1.01",
          actual: "12.00",
          sourceNetRowCount: 2,
          sourceNet: "12.00",
        },
        "2026-06-01": {
          rowCount: 1,
          debit: "0.00",
          credit: "2.01",
          actual: "-2.01",
          sourceNetRowCount: 1,
          sourceNet: "-2.01",
        },
      },
      budgetByMonth: {
        "2026-05-01": { rowCount: 20, budget: "20.20", rollover: "-0.20" },
      },
    });
    assert.equal(activatedInput.actuals.length, 3);
    assert.equal(activatedInput.budgets.length, 20);
    assert.ok(activatedInput.budgets.some(({ glAccountId }) => glAccountId === "gl-unmapped"));
    assert.equal(activatedInput.mappings.length, 19);
    assert.equal(activatedInput.metadata.isSynthetic, true);
    assert.equal(activatedInput.metadata.sourceChecksumSha256, sourceChecksumSha256);
    assert.equal(report.sourceChecksumSha256, sourceChecksumSha256);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the workbook load rejects a source net that does not reconcile before preparing references", async () => {
  const directory = await mkdtemp(join(tmpdir(), "financial mismatch "));
  const filePath = join(directory, "mismatched source.xlsx");
  try {
    await createWorkbook(filePath, { firstNet: "8.99", thirdNet: "3.01" });
    let called = false;
    await assert.rejects(
      loadFinancialWorkbook(
        { filePath, budgetOwner: "DUB", importingActor: "finance.operator" },
        {
          prepareReferences: async () => {
            called = true;
            return referenceData();
          },
          activateGeneration: async () => {
            called = true;
            return { batchId: "must-not-activate", activated: true, idempotent: false };
          },
        },
      ),
      /source net does not reconcile/i,
    );
    assert.equal(called, false, "a mismatched source must not write references or a generation");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  "WAREHOUSE_DB_TEST the real loader atomically persists exact coverage and months while a failed replacement changes nothing",
  { skip: process.env.WAREHOUSE_DB_TEST !== "1" },
  async () => {
    assertDisposableWarehouse();
    await migrateWarehouse();
    const pool = await createWarehouseWritePool();
    const directory = await mkdtemp(join(tmpdir(), "financial database load "));
    const firstPath = join(directory, "accepted source (1).xlsx");
    const failedPath = join(directory, "failed replacement (2).xlsx");
    try {
      await createWorkbook(firstPath);
      const first = await loadFinancialWorkbookIntoPool(
        { filePath: firstPath, budgetOwner: "DUB", importingActor: "database-proof", isSynthetic: true },
        pool,
      );
      const beforeFailure = await persistedGeneration(pool, first.batchId);
      assert.deepEqual(beforeFailure.sourceReportingMonths, ["2026-04-01", "2026-06-01"]);
      assert.deepEqual(beforeFailure.actualCoverage, [
        { plantId: beforeFailure.budgetOwnerPlantId, month: "2026-04-01", completeness: "unconfirmed" },
        { plantId: beforeFailure.budgetOwnerPlantId, month: "2026-06-01", completeness: "unconfirmed" },
      ]);
      assert.deepEqual(beforeFailure.budgetCoverage, [
        { plantId: beforeFailure.budgetOwnerPlantId, month: "2026-04-01", completeness: "confirmed" },
      ]);
      assert.equal(beforeFailure.state, "active");
      assert.equal(beforeFailure.isSynthetic, true);
      assert.equal(beforeFailure.actualCount, 3);
      assert.equal(beforeFailure.budgetCount, 20);
      assert.deepEqual(beforeFailure.actualSums, { debit: "13.01", credit: "3.02", actual: "9.99" });
      assert.deepEqual(beforeFailure.budgetSums, { budget: "20.20", rollover: "-0.20" });

      await createWorkbook(failedPath, { sourceGlCode: "88888888", sourceGlName: "Reference that must roll back" });
      await installActivationFailure(pool);
      await assert.rejects(
        loadFinancialWorkbookIntoPool(
          { filePath: failedPath, budgetOwner: "DUB", importingActor: "database-proof" },
          pool,
        ),
      );
      assert.deepEqual(await persistedGeneration(pool, first.batchId), beforeFailure);
      assert.equal(await activeGenerationId(pool), first.batchId);
      assert.equal(await glName(pool, "99999999"), "Unmapped source GL");
      assert.equal(await glName(pool, "88888888"), undefined);
    } finally {
      await removeActivationFailure(pool);
      await pool.end();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

function expectedReport(sourceChecksumSha256: string): FinancialLoadReport {
  return {
    batchId: "batch-1",
    sourceChecksumSha256,
    sourceFileName: "5 Months Financial Data (1).xlsx",
    counts: { actual: 3, budget: 20, components: 20, mappings: 19 },
    sourceReportingMonths: ["2026-04-01", "2026-05-01", "2026-06-01"],
    actualCoverage: [
      { plantCode: "DUB", month: "2026-04-01", completeness: "unconfirmed" },
      { plantCode: "DUB", month: "2026-06-01", completeness: "unconfirmed" },
    ],
    budgetCoverage: [{ plantCode: "DUB", month: "2026-05-01", completeness: "confirmed" }],
    sourceSums: {
      actualByMonth: {
        "2026-04-01": {
          rowCount: 2,
          debit: "13.01",
          credit: "1.01",
          actual: "12.00",
          sourceNetRowCount: 2,
          sourceNet: "12.00",
        },
        "2026-06-01": {
          rowCount: 1,
          debit: "0.00",
          credit: "2.01",
          actual: "-2.01",
          sourceNetRowCount: 1,
          sourceNet: "-2.01",
        },
      },
      budgetByMonth: {
        "2026-05-01": { rowCount: 20, budget: "20.20", rollover: "-0.20" },
      },
    },
    unknownActuals: { plant: 0, costCenter: 0, glAccount: 0 },
    unmappedActual: 1,
    roundingDelta: {
      debit: "0.005",
      credit: "0.010",
      sourceNet: "-0.005",
      budget: "0.100",
      rollover: "-0.100",
    },
    activated: true,
    idempotent: false,
  };
}

function referenceData(): FinancialLoadReferences {
  const costCenters = [...new Set(FINANCIAL_MAPPING_SEED.map(({ costCenterCode }) => costCenterCode))];
  const glAccounts = [...new Set(FINANCIAL_MAPPING_SEED.map(({ glCode }) => glCode))];
  return {
    plants: [{ id: "plant-dub", code: "DUB", sourceAliases: ["DUB-NUR"] }],
    glAccounts: [
      ...glAccounts.map((code, index) => ({ id: `gl-${index + 1}`, code, sourceAliases: [] })),
      { id: "gl-unmapped", code: "99999999", sourceAliases: [] },
    ],
    costCenters: [
      ...costCenters.map((code, index) => ({
        id: `cost-center-${index + 1}`,
        plantId: "plant-dub",
        code,
        sourceAliases: [],
      })),
      { id: "cost-center-unmapped", plantId: "plant-dub", code: "Unmapped CC", sourceAliases: [] },
    ],
  };
}

async function createWorkbook(
  path: string,
  options: {
    firstNet?: string;
    thirdNet?: string;
    sourceGlCode?: string;
    sourceGlName?: string;
    budgetMonth?: Date;
  } = {},
): Promise<void> {
  const workbook = new Workbook();
  const actual = workbook.addWorksheet("5 Months Financial Data");
  actual.addRow(ACTUAL_HEADERS);
  actual.addRow(actualRow("1", "2026-04-15", "Apr", "10.005", "1.005", options.firstNet ?? "9.000"));
  actual.addRow(actualRow("2", "2026-06-15", "Jun", "0", "2.005", "-2.005"));
  actual.addRow(
    actualRow(
      "3",
      "2026-04-20",
      "Apr",
      "3.00",
      "0",
      options.thirdNet ?? "3.00",
      "Unmapped CC",
      options.sourceGlCode ?? "99999999",
      options.sourceGlName ?? "Unmapped source GL",
    ),
  );

  const budget = workbook.addWorksheet("Nursery Fincail MIS ");
  budget.addRow([...BUDGET_HEADERS, options.budgetMonth ?? new Date(Date.UTC(2026, 3, 1)), "", "", ""]);
  budget.addRow(["", "", "", "", "", "Budget", "Roll Over Budget", "Actual", "%"]);
  for (const [index, entry] of FINANCIAL_MAPPING_SEED.entries()) {
    const [sNo, glCode, componentName] = entry.targetComponentKey.split("|");
    budget.addRow([sNo, componentName, "Y", entry.costCenterCode, glCode, "1.005", "-0.005", "", ""]);
    budget.getRow(index + 3).getCell(2).alignment = { indent: 0 };
  }
  budget.addRow([
    "X",
    "Unmapped Budget leaf",
    "Y",
    "Unmapped CC",
    options.sourceGlCode ?? "99999999",
    "1.005",
    "-0.005",
    "",
    "",
  ]);
  await workbook.xlsx.writeFile(path);
}

const ACTUAL_HEADERS = [
  "#",
  "Transaction Number",
  "Line_Id",
  "Posting Date",
  "Month",
  "Section",
  "Plant",
  "Cost Center",
  "Considaration",
  "MIS GL Code",
  "MIS GL Name",
  "Debit",
  "Credit",
  "net",
  "ShortName",
  "ContraAct",
  "LineMemo",
  "Comments",
  "Comments",
  "Origin",
  "Reference 1",
  "Loc.",
];

const BUDGET_HEADERS = ["S. No.", "Budget Components", "Rollover (Y/N)", "Payment Office", "GL Codes"];

function actualRow(
  suffix: string,
  postingDate: string,
  month: string,
  debit: string,
  credit: string,
  net: string,
  costCenter = FINANCIAL_MAPPING_SEED[0]!.costCenterCode,
  glCode = FINANCIAL_MAPPING_SEED[0]!.glCode,
  glName = "Source GL",
): string[] {
  return [
    suffix,
    `TX-${suffix}`,
    "1",
    postingDate,
    month,
    "Nursery",
    "DUB-NUR",
    costCenter,
    "",
    glCode,
    glName,
    debit,
    credit,
    net,
    "",
    "",
    "",
    "first",
    "second",
    "SAP",
    "",
    "DUB",
  ];
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertDisposableWarehouse(): void {
  assert.equal(
    `${process.env.WAREHOUSE_PG_HOST}:${process.env.WAREHOUSE_PG_PORT}/${process.env.WAREHOUSE_PG_DATABASE}`,
    "127.0.0.1:5434/warehouse",
    "financial loader proof requires 127.0.0.1:5434/warehouse",
  );
}

async function installActivationFailure(pool: Pool): Promise<void> {
  await removeActivationFailure(pool);
  await pool.query(`CREATE FUNCTION agent_financial.reject_loader_replacement() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'database proof rejects replacement'; END $$`);
  await pool.query(`CREATE TRIGGER reject_loader_replacement
    BEFORE INSERT ON agent_financial.ingestion_batch
    FOR EACH ROW EXECUTE FUNCTION agent_financial.reject_loader_replacement()`);
}

async function removeActivationFailure(pool: Pool): Promise<void> {
  await pool.query("DROP TRIGGER IF EXISTS reject_loader_replacement ON agent_financial.ingestion_batch");
  await pool.query("DROP FUNCTION IF EXISTS agent_financial.reject_loader_replacement()");
}

async function persistedGeneration(pool: Pool, batchId: string) {
  const result = await pool.query<{
    state: string;
    is_synthetic: boolean;
    budget_owner_plant_id: string;
    source_reporting_months: string[];
    actual_coverage: Array<{ plantId: string; month: string; completeness: string }>;
    budget_coverage: Array<{ plantId: string; month: string; completeness: string }>;
    actual_count: number;
    budget_count: number;
    actual_debit: string;
    actual_credit: string;
    actual_amount: string;
    budget_amount: string;
    rollover_amount: string;
  }>(
    `SELECT state, is_synthetic, budget_owner_plant_id, source_reporting_months::text[] AS source_reporting_months,
            actual_coverage, budget_coverage,
            (SELECT count(*)::int FROM agent_financial.financial_actual WHERE batch_id = $1) AS actual_count,
            (SELECT count(*)::int FROM agent_financial.nursery_budget WHERE batch_id = $1) AS budget_count,
            (SELECT sum(debit)::text FROM agent_financial.financial_actual WHERE batch_id = $1) AS actual_debit,
            (SELECT sum(credit)::text FROM agent_financial.financial_actual WHERE batch_id = $1) AS actual_credit,
            (SELECT sum(actual_amount)::text FROM agent_financial.financial_actual WHERE batch_id = $1) AS actual_amount,
            (SELECT sum(budget_amount)::text FROM agent_financial.nursery_budget WHERE batch_id = $1) AS budget_amount,
            (SELECT sum(rollover_amount)::text FROM agent_financial.nursery_budget WHERE batch_id = $1) AS rollover_amount
       FROM agent_financial.ingestion_batch WHERE id = $1`,
    [batchId],
  );
  const row = result.rows[0];
  assert.ok(row);
  return {
    state: row.state,
    isSynthetic: row.is_synthetic,
    budgetOwnerPlantId: row.budget_owner_plant_id,
    sourceReportingMonths: row.source_reporting_months,
    actualCoverage: row.actual_coverage,
    budgetCoverage: row.budget_coverage,
    actualCount: row.actual_count,
    budgetCount: row.budget_count,
    actualSums: { debit: row.actual_debit, credit: row.actual_credit, actual: row.actual_amount },
    budgetSums: { budget: row.budget_amount, rollover: row.rollover_amount },
  };
}

async function activeGenerationId(pool: Pool): Promise<string | undefined> {
  const result = await pool.query<{ id: string }>(
    "SELECT id FROM agent_financial.ingestion_batch WHERE dataset_key = $1 AND state = 'active'",
    ["financial-chat-workbook"],
  );
  return result.rows[0]?.id;
}

async function glName(pool: Pool, code: string): Promise<string | undefined> {
  const result = await pool.query<{ name: string }>(
    "SELECT name FROM agent_financial.gl_account WHERE source_system = 'SAP' AND code = $1",
    [code],
  );
  return result.rows[0]?.name;
}
