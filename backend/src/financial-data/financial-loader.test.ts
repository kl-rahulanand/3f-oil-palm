import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Workbook } from "exceljs";
import { parseFinancialLoadArguments } from "./financial-load.cli";
import { FINANCIAL_MAPPING_SEED } from "./financial-mapping.seed";
import {
  loadFinancialWorkbook,
  type FinancialLoadReferences,
  type FinancialLoadReport,
  type FinancialReferenceSource,
} from "./financial-loader";
import type { FinancialGenerationInput } from "./financial-load.repository";

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
    await createWorkbook(filePath);
    let activatedInput: FinancialGenerationInput | undefined;
    let referencesPrepared = false;
    const report = await loadFinancialWorkbook(
      { filePath, budgetOwner: "DUB", importingActor: "finance.operator" },
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
    assert.deepEqual(activatedInput.metadata.sourceReportingMonths, ["2026-04-01", "2026-06-01"]);
    assert.deepEqual(activatedInput.metadata.actualCoverage, [
      { plantId: "plant-dub", month: "2026-04-01", completeness: "unconfirmed" },
      { plantId: "plant-dub", month: "2026-06-01", completeness: "unconfirmed" },
    ]);
    assert.deepEqual(activatedInput.metadata.budgetCoverage, [
      { plantId: "plant-dub", month: "2026-04-01", completeness: "confirmed" },
    ]);
    assert.deepEqual(activatedInput.metadata.reconciliationResult, {
      reconciled: true,
      actualByMonth: {
        "2026-04-01": { rowCount: 2, debit: "13.01", credit: "1.01", actual: "12.00" },
        "2026-06-01": { rowCount: 1, debit: "0.00", credit: "2.01", actual: "-2.01" },
      },
      budgetByMonth: {
        "2026-04-01": { rowCount: 20, budget: "20.20", rollover: "-0.20" },
      },
    });
    assert.equal(activatedInput.actuals.length, 3);
    assert.equal(activatedInput.budgets.length, 20);
    assert.ok(activatedInput.budgets.some(({ glAccountId }) => glAccountId === "gl-unmapped"));
    assert.equal(activatedInput.mappings.length, 19);
    assert.equal(activatedInput.metadata.isSynthetic, false);
    assert.equal(activatedInput.metadata.sourceChecksumSha256, sourceChecksumSha256);
    assert.equal(report.sourceChecksumSha256, sourceChecksumSha256);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function expectedReport(sourceChecksumSha256: string): FinancialLoadReport {
  return {
    batchId: "batch-1",
    sourceChecksumSha256,
    sourceFileName: "5 Months Financial Data (1).xlsx",
    counts: { actual: 3, budget: 20, components: 20, mappings: 19 },
    sourceReportingMonths: ["2026-04-01", "2026-06-01"],
    actualCoverage: [
      { plantCode: "DUB", month: "2026-04-01", completeness: "unconfirmed" },
      { plantCode: "DUB", month: "2026-06-01", completeness: "unconfirmed" },
    ],
    budgetCoverage: [{ plantCode: "DUB", month: "2026-04-01", completeness: "confirmed" }],
    sourceSums: {
      actualByMonth: {
        "2026-04-01": { rowCount: 2, debit: "13.01", credit: "1.01", actual: "12.00" },
        "2026-06-01": { rowCount: 1, debit: "0.00", credit: "2.01", actual: "-2.01" },
      },
      budgetByMonth: {
        "2026-04-01": { rowCount: 20, budget: "20.20", rollover: "-0.20" },
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

async function createWorkbook(path: string): Promise<void> {
  const workbook = new Workbook();
  const actual = workbook.addWorksheet("5 Months Financial Data");
  actual.addRow(ACTUAL_HEADERS);
  actual.addRow(actualRow("1", "2026-04-15", "Apr", "10.005", "1.005", "9.000"));
  actual.addRow(actualRow("2", "2026-06-15", "Jun", "0", "2.005", "-2.005"));
  actual.addRow(
    actualRow("3", "2026-04-20", "Apr", "3.00", "0", "3.00", "Unmapped CC", "99999999", "Unmapped source GL"),
  );

  const budget = workbook.addWorksheet("Nursery Fincail MIS ");
  budget.addRow([...BUDGET_HEADERS, new Date(Date.UTC(2026, 3, 1)), "", "", ""]);
  budget.addRow(["", "", "", "", "", "Budget", "Roll Over Budget", "Actual", "%"]);
  for (const [index, entry] of FINANCIAL_MAPPING_SEED.entries()) {
    const [sNo, glCode, componentName] = entry.targetComponentKey.split("|");
    budget.addRow([sNo, componentName, "Y", entry.costCenterCode, glCode, "1.005", "-0.005", "", ""]);
    budget.getRow(index + 3).getCell(2).alignment = { indent: 0 };
  }
  budget.addRow(["X", "Unmapped Budget leaf", "Y", "Unmapped CC", "99999999", "1.005", "-0.005", "", ""]);
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
