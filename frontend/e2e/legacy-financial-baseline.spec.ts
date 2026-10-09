import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type {
  MisDrillFooter,
  MisDrillLine,
  MisStatementMeasureBlock,
  MisStatementNode,
  MisStatementResolvedResponse,
  ProvenanceBatch,
} from "@3f/contract";
import {
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Download,
  type Locator,
  type Page,
  test,
} from "@playwright/test";
import { Workbook, type CellValue } from "exceljs";
import { trustedTaskDirectory } from "../playwright.config";

const API_BASE = "http://127.0.0.1:4000";
const SOURCE_MODE = process.env.FINANCIAL_CHAT_E2E_DATASET;
const GENERATED_PERIOD = "2026-04-01";
const GENERATED_ACTUAL = "175.00";
const REPORT_SCOPE = { department: "Agriculture", function: "Nursery", plant: "DUB" } as const;
const GENERATED_REPORT_TREE: MisStatementNode[] = [
  {
    nodeKey: "leaf:4.5|50001605|fertilizers-manures",
    sNo: "4.5",
    budgetComponent: "Fertilizers & Manures",
    glCode: "50001605",
    measures: [
      {
        key: "selected",
        label: GENERATED_PERIOD,
        from: GENERATED_PERIOD,
        to: GENERATED_PERIOD,
        rollover: null,
        actual: GENERATED_ACTUAL,
        sourcePresence: ["matched"],
        budgetState: "loaded",
        budget: "200.00",
        percentage: "0.875",
      },
    ],
    children: [],
  },
];
const GENERATED_GRAND_TOTAL: MisStatementNode = {
  nodeKey: "grand-total",
  sNo: null,
  budgetComponent: "Grand Total",
  glCode: null,
  measures: [
    {
      key: "selected",
      label: GENERATED_PERIOD,
      from: GENERATED_PERIOD,
      to: GENERATED_PERIOD,
      rollover: null,
      actual: GENERATED_ACTUAL,
      sourcePresence: ["matched"],
      budgetState: "loaded",
      budget: "200.00",
      percentage: "0.875",
    },
  ],
  children: [],
};
const GENERATED_DRILL: DrillBaseline = {
  nodeKey: "leaf:4.5|50001605|fertilizers-manures",
  lines: [
    {
      month: GENERATED_PERIOD,
      postingDate: "2026-04-05",
      txnNo: "GEN-1",
      costCenter: "Primary",
      accountName: "Fertilizers & Manures",
      debit: "150.00",
      credit: "25.00",
      value: "125.00",
      reference: "A",
      memo: "Generated proof",
    },
    {
      month: GENERATED_PERIOD,
      postingDate: "2026-04-06",
      txnNo: "GEN-2",
      costCenter: "Primary",
      accountName: "Fertilizers & Manures",
      debit: "50.00",
      credit: "0.00",
      value: "50.00",
      reference: "B",
      memo: "Generated proof",
    },
  ],
  totalCount: 2,
  footer: { debit: "200.00", credit: "25.00", value: GENERATED_ACTUAL },
  page: 1,
  pageSize: 100,
};
const GENERATED_EXPORT: FinancialWorkbookSnapshot = [
  {
    name: "Financial MIS",
    rows: [
      ["Financial MIS", "Financial MIS", "Financial MIS", "April 2026", "April 2026", "April 2026", "April 2026"],
      ["S. No.", "Budget Component", "GL Code", "Budget", "Roll-over", "Actual", "%"],
      ["4.5", "Fertilizers & Manures", "50001605", 200, null, 175, 0.875],
      ["Grand Total", "Grand Total", "Grand Total", 200, null, 175, 0.875],
    ],
  },
];

test.describe("legacy financial BASELINE", () => {
  test("proof controls reject unsafe settings and keep artifact failures inside the trusted directory", async () => {
    const inheritedDatabase = process.env.PGDATABASE;
    delete process.env.PGDATABASE;
    try {
      expect(configExit({})).toBe(0);
    } finally {
      if (inheritedDatabase === undefined) delete process.env.PGDATABASE;
      else process.env.PGDATABASE = inheritedDatabase;
    }
    for (const unsafe of [
      { WAREHOUSE_PG_HOST: "warehouse.example.invalid" },
      { WAREHOUSE_PG_PORT: "5433" },
      { WAREHOUSE_PG_DATABASE: "postgres" },
      { PGHOST: "app.example.invalid" },
      { PGPORT: "5432" },
      { PGDATABASE: "postgres" },
      { LLM_PROVIDER: "anthropic" },
      { AUTH_OTP_MOCK: "0" },
      { BIND_HOST: "0.0.0.0" },
      { WAREHOUSE_DRIVER: "http" },
      { NEXT_PUBLIC_API_BASE_URL: "https://example.invalid" },
      { FRONTEND_ORIGIN: "https://example.invalid" },
      { PORT: "4100" },
      { FINANCIAL_CHAT_DUAL_DB_TEST: "0" },
      { PGUSER: undefined },
      { PGPASSWORD: undefined },
      { WAREHOUSE_PG_USER: undefined },
      { WAREHOUSE_PG_PASSWORD: undefined },
      { FINANCIAL_CHAT_E2E_DATASET: "unexpected" },
      { CI: "1" },
    ]) {
      expect(configExit(unsafe)).toBe(1);
    }

    const junctionRoot = await mkdtemp(join(tmpdir(), "3f-financial-evidence-control-"));
    const junction = join(junctionRoot, "3f-financial-linked-evidence");
    await symlink(resolve(__dirname, "../.."), junction, "junction");
    const previousEvidenceDirectory = process.env.FINANCIAL_CHAT_E2E_EVIDENCE_DIR;
    const previousBaselineDirectory = process.env.FINANCIAL_CHAT_BASELINE_DIR;
    process.env.FINANCIAL_CHAT_E2E_EVIDENCE_DIR = junction;
    try {
      expect(() => evidenceDirectory()).toThrow(/trusted task temporary directory/);
      const rejectedChildName = `legacy-proof-rejected-${process.pid}`;
      const escapedChild = join(resolve(__dirname, "../.."), rejectedChildName);
      expect(existsSync(escapedChild)).toBe(false);
      process.env.FINANCIAL_CHAT_E2E_EVIDENCE_DIR = join(junction, rejectedChildName);
      expect(() => evidenceDirectory()).toThrow(/trusted task temporary directory/);
      expect(existsSync(escapedChild)).toBe(false);
      process.env.FINANCIAL_CHAT_BASELINE_DIR = resolve(__dirname, "../..");
      expect(() => realBaselineDirectory()).toThrow(/trusted task temporary directory/);
      process.env.FINANCIAL_CHAT_BASELINE_DIR = junction;
      expect(() => realBaselineDirectory()).toThrow(/trusted task temporary directory/);
    } finally {
      if (previousEvidenceDirectory === undefined) delete process.env.FINANCIAL_CHAT_E2E_EVIDENCE_DIR;
      else process.env.FINANCIAL_CHAT_E2E_EVIDENCE_DIR = previousEvidenceDirectory;
      if (previousBaselineDirectory === undefined) delete process.env.FINANCIAL_CHAT_BASELINE_DIR;
      else process.env.FINANCIAL_CHAT_BASELINE_DIR = previousBaselineDirectory;
      await rm(junctionRoot, { recursive: true, force: true });
    }

    await expect(validateFinancialExport(Buffer.from("not an xlsx"), GENERATED_EXPORT)).rejects.toThrow();
    const wrong = new Workbook();
    wrong.addWorksheet("Financial MIS").addRow(["Grand Total", 999]);
    await expect(
      validateFinancialExport(Buffer.from(await wrong.xlsx.writeBuffer()), GENERATED_EXPORT),
    ).rejects.toThrow(/does not match the recorded baseline/);

    const fakeCustomerMarker = "FAKE-CUSTOMER-ROW-CONTROL";
    const mismatchPath = join(evidenceDirectory(), "real-source-control-mismatch.json");
    const error = await baselineMismatch(
      "control",
      { row: fakeCustomerMarker },
      { row: "expected fake row" },
      "real-source",
    ).catch((reason: unknown) => reason);
    expect(String(error)).not.toContain(fakeCustomerMarker);
    expect(await readFile(mismatchPath, "utf8")).toContain(fakeCustomerMarker);
    await rm(mismatchPath, { force: true });
  });

  test("generated BASELINE preserves report, export, drill-down, and mock-provider Ask clarification", async ({
    context,
    page,
  }) => {
    test.skip(SOURCE_MODE !== "generated", "set FINANCIAL_CHAT_E2E_DATASET=generated for disposable generated proof");

    await signIn(page, "admin@example.invalid");
    const generated = await generatedWorkbooks();
    const actualLoad = await upload(
      context.request,
      context,
      "/api/ingest/actuals",
      "Generated Actual.xlsx",
      generated.actual,
    );
    const budgetLoad = await upload(
      context.request,
      context,
      "/api/ingest/budget",
      "Generated Budget.xlsx",
      generated.budget,
    );
    const actualBatchId = requiredString(actualLoad, "batchId");
    const budgetBatchIds = requiredStringArray(budgetLoad, "periods", "batchId");

    await exerciseLegacyScreens(page, {
      scope: { ...REPORT_SCOPE, period: GENERATED_PERIOD },
      expectedActual: GENERATED_ACTUAL,
      expectedExport: GENERATED_EXPORT,
      expectedReport: {
        tree: GENERATED_REPORT_TREE,
        grandTotal: GENERATED_GRAND_TOTAL,
        activeBatchIds: [
          { source: "actuals", period: GENERATED_PERIOD, batchId: actualBatchId },
          { source: "budget", period: GENERATED_PERIOD, batchId: budgetBatchIds[0]! },
        ],
      },
      expectedDrill: GENERATED_DRILL,
      evidence: {
        classification: "generated",
        sourceSha256: generated.sha256,
        actualBatchIds: [actualBatchId],
        budgetBatchIds,
      },
    });
  });

  test("real-source BASELINE preserves report, export, drill-down, and mock-provider Ask clarification", async ({
    page,
  }) => {
    test.skip(SOURCE_MODE !== "real", "set FINANCIAL_CHAT_E2E_DATASET=real after restoring the fixed BASELINE dataset");

    const baseline = await realBaseline();
    await signIn(page, "financial-baseline@example.test");
    await exerciseLegacyScreens(page, {
      scope: { ...REPORT_SCOPE, period: baseline.scope.period },
      expectedActual: baseline.actual,
      expectedExport: baseline.exportSnapshot,
      expectedReport: {
        tree: baseline.report.tree,
        grandTotal: baseline.report.grandTotal,
        activeBatchIds: baseline.report.provenance.activeBatchIds,
      },
      expectedDrill: baseline.drill,
      evidence: {
        classification: "real-source",
        sourceSha256: baseline.sourceSha256,
        actualBatchIds: baseline.actualBatchIds,
        budgetBatchIds: baseline.budgetBatchIds,
      },
    });
  });
});

interface LegacyProof {
  scope: typeof REPORT_SCOPE & { period: string };
  expectedActual: string;
  expectedExport: FinancialWorkbookSnapshot;
  expectedReport: ReportBaseline;
  expectedDrill: DrillBaseline;
  evidence: {
    classification: "generated" | "real-source";
    sourceSha256: string;
    actualBatchIds: string[];
    budgetBatchIds: string[];
  };
}

interface ReportBaseline {
  tree: MisStatementNode[];
  grandTotal: MisStatementNode;
  activeBatchIds: ProvenanceBatch[];
}

interface DrillBaseline {
  nodeKey: string;
  lines: MisDrillLine[];
  totalCount: number;
  footer: MisDrillFooter;
  page: number;
  pageSize: 100;
}

type FinancialWorkbookSnapshot = Array<{
  name: string;
  rows: Array<Array<string | number | boolean | null>>;
}>;

async function exerciseLegacyScreens(page: Page, proof: LegacyProof): Promise<void> {
  await page.goto("/mis-reports");
  await expect(page.getByRole("heading", { name: "MIS Reports" })).toBeVisible();
  await page.getByLabel("Department").selectOption(proof.scope.department);
  await page.getByLabel("Function").selectOption(proof.scope.function);
  await page.getByLabel("Plant").selectOption(proof.scope.plant);
  await page.getByLabel("Period").selectOption(proof.scope.period);
  const reportResponsePromise = page.waitForResponse(
    (response) => response.url() === `${API_BASE}/api/mis/statement` && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Generate" }).click();
  const reportResponse = await reportResponsePromise;
  expect(reportResponse.ok()).toBe(true);
  const observedReport = (await reportResponse.json()) as MisStatementResolvedResponse;
  expect(observedReport.outcome).toBe("resolved");
  expect({
    department: observedReport.scope.department,
    function: observedReport.scope.function,
    plant: observedReport.scope.plant,
    period: observedReport.scope.period,
  }).toEqual(proof.scope);
  expect(observedReport.provenance.activeBatchIds).toEqual(proof.expectedReport.activeBatchIds);

  const statement = page.getByRole("treegrid", { name: "Financial MIS statement" });
  await expect(statement).toBeVisible();
  await expectRenderedReport(statement, proof.expectedReport, proof.evidence.classification);
  await capture(page, proof.evidence.classification, "report");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Excel" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    `financial-mis-agriculture-nursery-dub-${proof.scope.period}-to-${proof.scope.period}.xlsx`,
  );
  await assertTrustedDownload(download, proof.evidence.classification);
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  await validateFinancialExport(Buffer.concat(chunks), proof.expectedExport, proof.evidence.classification);

  const targetRowIndex = flattenReportRows(proof.expectedReport.tree).findIndex(
    ({ nodeKey }) => nodeKey === proof.expectedDrill.nodeKey,
  );
  expect(targetRowIndex).toBeGreaterThanOrEqual(0);
  const targetNode = flattenReportRows(proof.expectedReport.tree)[targetRowIndex]!;
  expect(targetNode.children).toHaveLength(0);
  const selectedDrillButton = statement
    .locator("tbody > tr")
    .nth(targetRowIndex)
    .getByRole("button", { name: /Drill down Actual/ })
    .first();
  const drillResponsePromise = page.waitForResponse(
    (response) => response.url() === `${API_BASE}/api/mis/statement/drill` && response.request().method() === "POST",
  );
  await selectedDrillButton.focus();
  await page.keyboard.press("Enter");
  const drillResponse = await drillResponsePromise;
  expect(drillResponse.ok()).toBe(true);
  const observedDrill = (await drillResponse.json()) as {
    nodeKey: string;
    lines: MisDrillLine[];
    totalCount: number;
    footer: MisDrillFooter;
    page: number;
    pageSize: 100;
  };
  await baselineMismatch(
    "drill-response",
    {
      nodeKey: observedDrill.nodeKey,
      lines: observedDrill.lines,
      totalCount: observedDrill.totalCount,
      footer: observedDrill.footer,
      page: observedDrill.page,
      pageSize: observedDrill.pageSize,
    },
    proof.expectedDrill,
    proof.evidence.classification,
  );
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expectRenderedDrill(dialog, proof.expectedDrill, proof.evidence.classification);
  await capture(page, proof.evidence.classification, "drill");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(selectedDrillButton).toBeFocused();

  await page.goto("/ask");
  await page.getByPlaceholder("Ask about your MIS data…").fill("Hello, show performance");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByText("Choose a configured data domain to explore.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Show me a .* metric/ }).first()).toBeVisible();
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
  await capture(page, proof.evidence.classification, "ask-mobile-dark");

  await recordEvidence(proof, observedReport.provenance.activeBatchIds, page.url());
}

async function expectRenderedReport(
  statement: Locator,
  baseline: ReportBaseline,
  classification: LegacyProof["evidence"]["classification"],
): Promise<void> {
  const observedRows = await statement.locator("tbody > tr").evaluateAll((rows) =>
    rows.map((row) => ({
      level: Number(row.getAttribute("aria-level")),
      cells: Array.from(row.querySelectorAll(":scope > th, :scope > td"), (cell) => cell.textContent?.trim() ?? ""),
    })),
  );
  await baselineMismatch(
    "report-rows",
    observedRows,
    flattenReportRows(baseline.tree).map((node) => ({
      level: node.level,
      cells: reportRowCells(node),
    })),
    classification,
  );

  const grandTotalCells = await statement
    .locator("tfoot > tr")
    .evaluate((row) =>
      Array.from(row.querySelectorAll(":scope > th, :scope > td"), (cell) => cell.textContent?.trim() ?? ""),
    );
  await baselineMismatch(
    "report-grand-total",
    grandTotalCells,
    ["Grand total", ...measureCells(baseline.grandTotal.measures)],
    classification,
  );
}

async function expectRenderedDrill(
  dialog: Locator,
  baseline: DrillBaseline,
  classification: LegacyProof["evidence"]["classification"],
): Promise<void> {
  const table = dialog.locator("table.mis-drill-transactions");
  await expect(table).toBeVisible();
  const observedRows = await table
    .locator("tbody > tr")
    .evaluateAll((rows) =>
      rows.map((row) =>
        Array.from(row.querySelectorAll(":scope > th, :scope > td"), (cell) => cell.textContent?.trim() ?? ""),
      ),
    );
  await baselineMismatch(
    "drill-rows",
    observedRows,
    baseline.lines.map((line) => [
      formatMonth(line.month),
      formatDate(line.postingDate),
      line.txnNo,
      line.costCenter,
      line.accountName,
      formatMoney(line.debit),
      formatMoney(line.credit),
      formatMoney(line.value),
      line.reference ?? "—",
      line.memo ?? "—",
    ]),
    classification,
  );

  const footerCells = await table
    .locator("tfoot > tr")
    .evaluate((row) =>
      Array.from(row.querySelectorAll(":scope > th, :scope > td"), (cell) =>
        (cell as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
      ),
    );
  await baselineMismatch(
    "drill-footer",
    footerCells,
    [
      "Total",
      `${formatMoney(baseline.footer.debit)} ${formatExactMoney(baseline.footer.debit)} exact`,
      `${formatMoney(baseline.footer.credit)} ${formatExactMoney(baseline.footer.credit)} exact`,
      `${formatMoney(baseline.footer.value)} ${formatExactMoney(baseline.footer.value)} exact`,
      "Matches the Actual in the report",
    ],
    classification,
  );
  await expect(
    dialog.getByText(`${baseline.totalCount} matching · rows 1–${baseline.lines.length} on screen`),
  ).toBeVisible();
  await expect(dialog.getByText(`Page ${baseline.page}`, { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Previous" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Next" })).toBeDisabled();
}

function flattenReportRows(nodes: MisStatementNode[], level = 1): Array<MisStatementNode & { level: number }> {
  return nodes.flatMap((node) => [{ ...node, level }, ...flattenReportRows(node.children, level + 1)]);
}

function reportRowCells(node: MisStatementNode): string[] {
  return [node.sNo ?? "", node.budgetComponent, node.glCode ?? "", ...measureCells(node.measures)];
}

function measureCells(measures: MisStatementMeasureBlock[]): string[] {
  return measures.flatMap((measure) =>
    measure.budgetState === "not-loaded"
      ? ["–", "–", formatMoney(measure.actual), "–"]
      : [formatMoney(measure.budget), "", formatMoney(measure.actual), formatPercentage(measure.percentage)],
  );
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
}

async function upload(
  request: APIRequestContext,
  context: BrowserContext,
  path: string,
  name: string,
  buffer: Buffer,
): Promise<unknown> {
  const csrf = await freshCsrf(request, context);
  const response = await request.post(`${API_BASE}${path}`, {
    headers: { "x-csrf-token": csrf },
    multipart: {
      file: { name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer },
    },
  });
  const body = await response.text();
  expect(response.status(), body).toBe(201);
  return JSON.parse(body) as unknown;
}

async function freshCsrf(request: APIRequestContext, context: BrowserContext): Promise<string> {
  const response = await request.get(`${API_BASE}/api/auth/csrf`);
  expect(response.ok()).toBe(true);
  const cookie = (await context.cookies(API_BASE)).find(({ name }) => name === "3f_csrf");
  expect(cookie?.value).toBeTruthy();
  return cookie!.value;
}

async function generatedWorkbooks(): Promise<{ actual: Buffer; budget: Buffer; sha256: string }> {
  const actualWorkbook = new Workbook();
  const actual = actualWorkbook.addWorksheet("Actual");
  actual.addRow([
    "Transaction Number",
    "Line_Id",
    "Posting Date",
    "Month",
    "Plant",
    "Cost Center",
    "MIS GL Code",
    "AcctName",
    "Debit",
    "Credit",
    "ContraAct",
    "LineMemo",
    "Reference 1",
  ]);
  actual.addRow([
    "GEN-1",
    "1",
    "2026-04-05",
    "apr",
    "DUB-NUR",
    "Primary",
    "50001605",
    "Fertilizers & Manures",
    "150.00",
    "25.00",
    "",
    "Generated proof",
    "A",
  ]);
  actual.addRow([
    "GEN-2",
    "1",
    "2026-04-06",
    "apr",
    "DUB-NUR",
    "Primary",
    "50001605",
    "Fertilizers & Manures",
    "50.00",
    "0.00",
    "",
    "Generated proof",
    "B",
  ]);

  const budgetWorkbook = new Workbook();
  const budget = budgetWorkbook.addWorksheet("Nursery Financial MIS");
  budget.addRow(["S. No.", "Budget Components", "GL Codes", new Date("2026-04-01T00:00:00Z"), "", "", ""]);
  budget.addRow(["", "", "", "Budget", "Roll Over Budget", "Actual", "%"]);
  budget.addRow(["4.5", "Fertilizers & Manures", "50001605", "200.00", "50.00", "", ""]);

  const actualBuffer = Buffer.from(await actualWorkbook.xlsx.writeBuffer());
  const budgetBuffer = Buffer.from(await budgetWorkbook.xlsx.writeBuffer());
  return {
    actual: actualBuffer,
    budget: budgetBuffer,
    sha256: createHash("sha256").update(actualBuffer).update(budgetBuffer).digest("hex"),
  };
}

async function realBaseline(): Promise<{
  sourceSha256: string;
  actualBatchIds: string[];
  budgetBatchIds: string[];
  scope: { period: string };
  actual: string;
  report: MisStatementResolvedResponse;
  drill: DrillBaseline;
  exportSnapshot: FinancialWorkbookSnapshot;
}> {
  const sourcePath = process.env.FINANCIAL_CHAT_SOURCE_FILE;
  if (!sourcePath || !existsSync(sourcePath)) {
    throw new Error("real-source proof requires FINANCIAL_CHAT_SOURCE_FILE and FINANCIAL_CHAT_BASELINE_DIR");
  }
  const baselineDirectory = realBaselineDirectory();
  const artifact = JSON.parse(await readFile(join(baselineDirectory, "legacy-backend-baseline.json"), "utf8")) as {
    sourceSha256: string;
    actualBatchIds: string[];
    budgetBatchIds: string[];
    scope: { period: string };
    report: MisStatementResolvedResponse;
    drill: Pick<DrillBaseline, "lines" | "totalCount" | "footer">;
    exportSnapshot: FinancialWorkbookSnapshot;
  };
  const sourceSha256 = createHash("sha256")
    .update(await readFile(sourcePath))
    .digest("hex");
  expect(sourceSha256).toBe("8af9040a4a1096fbd182709b826d77df536ea55928e1deffd86bd14293c76810");
  expect(artifact.sourceSha256).toBe(sourceSha256);
  const target = flattenReportRows(artifact.report.tree).find(
    ({ children, measures }) => children.length === 0 && measures[0]?.actual !== "0.00",
  );
  if (!target) throw new Error("real-source baseline has no nonzero leaf drill target");
  await baselineMismatch(
    "baseline-drill-total",
    artifact.drill.footer.value,
    target.measures[0]!.actual,
    "real-source",
  );
  return {
    ...artifact,
    actual: artifact.report.grandTotal.measures[0]!.actual,
    drill: { ...artifact.drill, nodeKey: target.nodeKey, page: 1, pageSize: 100 },
  };
}

async function capture(page: Page, classification: string, name: string): Promise<void> {
  const directory = evidenceDirectory();
  await page.screenshot({ path: join(directory, `${classification}-${name}.png`), fullPage: true });
}

async function assertTrustedDownload(
  download: Download,
  classification: LegacyProof["evidence"]["classification"],
): Promise<void> {
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("Downloaded Financial MIS workbook has no local path");
  const canonicalDownload = await realpath(downloadPath);
  const fromEvidence = relative(evidenceDirectory(), canonicalDownload);
  if (isAbsolute(fromEvidence) || /^\.\.(?:[\\/]|$)/.test(fromEvidence)) {
    await baselineMismatch("download-location", canonicalDownload, evidenceDirectory(), classification);
  }
}

async function baselineMismatch(
  label: string,
  actual: unknown,
  expected: unknown,
  classification: LegacyProof["evidence"]["classification"],
): Promise<void> {
  if (isDeepStrictEqual(actual, expected)) return;
  if (classification === "generated") {
    expect(actual).toEqual(expected);
    return;
  }
  const detailPath = join(evidenceDirectory(), `real-source-${label}-mismatch.json`);
  await writeFile(detailPath, `${JSON.stringify({ actual, expected }, null, 2)}\n`);
  throw new Error(
    `Real-source ${label} does not match the recorded baseline; details are in the trusted evidence directory`,
  );
}

async function recordEvidence(
  proof: LegacyProof,
  reportActiveBatchIds: ProvenanceBatch[],
  finalUrl: string,
): Promise<void> {
  const directory = evidenceDirectory();
  const evidence = {
    ...proof.evidence,
    reportActiveBatchIds,
    scope: proof.scope,
    expectedActual: proof.expectedActual,
    finalUrl,
    capturedAtUtc: new Date().toISOString(),
  };
  await writeFile(
    join(directory, `${proof.evidence.classification}-legacy-ui-evidence.json`),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
}

function realBaselineDirectory(): string {
  const directory = process.env.FINANCIAL_CHAT_BASELINE_DIR;
  if (!directory) {
    throw new Error("real-source proof requires FINANCIAL_CHAT_SOURCE_FILE and FINANCIAL_CHAT_BASELINE_DIR");
  }
  return trustedTaskDirectory(directory, resolve(__dirname, "../.."));
}

function evidenceDirectory(): string {
  return trustedTaskDirectory(
    process.env.FINANCIAL_CHAT_E2E_EVIDENCE_DIR ?? join(tmpdir(), "3f-financial-legacy-ui-evidence"),
    resolve(__dirname, "../.."),
  );
}

function requiredString(value: unknown, key: string): string {
  if (!value || typeof value !== "object" || typeof (value as Record<string, unknown>)[key] !== "string") {
    throw new Error(`ingest response is missing ${key}`);
  }
  return (value as Record<string, string>)[key]!;
}

function requiredStringArray(value: unknown, key: string, childKey: string): string[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as Record<string, unknown>)[key])) {
    throw new Error(`ingest response is missing ${key}`);
  }
  return ((value as Record<string, unknown>)[key] as unknown[]).map((entry) => requiredString(entry, childKey));
}

function formatMoney(value: string): string {
  const negative = value.startsWith("-");
  const [whole, paise] = value.replace("-", "").split(".");
  const rounded = BigInt(whole!) + (paise! >= "50" ? BigInt(1) : BigInt(0));
  return `${negative && rounded !== BigInt(0) ? "−" : ""}₹${formatRupeeDigits(rounded.toString())}`;
}

function formatExactMoney(value: string): string {
  const negative = value.startsWith("-");
  const [whole, paise] = value.replace("-", "").split(".");
  return `${negative && value !== "-0.00" ? "−" : ""}₹${formatRupeeDigits(whole!)}.${paise}`;
}

function formatRupeeDigits(digits: string): string {
  const lastThree = digits.slice(-3);
  const leading = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${leading ? `${leading},` : ""}${lastThree}`;
}

function formatPercentage(value: string | null): string {
  if (value === null) return "NA";
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 1 }).format(numeric)
    : value;
}

function formatMonth(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }).format(
    dateAtUtc(value),
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(dateAtUtc(value));
}

function dateAtUtc(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

function configExit(changes: Record<string, string | undefined>): number | null {
  const checkout = resolve(__dirname, "../..");
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    FINANCIAL_CHAT_DUAL_DB_TEST: "1",
    BIND_HOST: "127.0.0.1",
    WAREHOUSE_DRIVER: "postgres",
    WAREHOUSE_PG_HOST: "127.0.0.1",
    WAREHOUSE_PG_PORT: "5434",
    WAREHOUSE_PG_DATABASE: "financial_proof",
    WAREHOUSE_PG_USER: "proof",
    WAREHOUSE_PG_PASSWORD: "proof",
    PGHOST: "127.0.0.1",
    PGPORT: "5435",
    PGDATABASE: "financial_proof",
    PGUSER: "proof",
    PGPASSWORD: "proof",
    LLM_PROVIDER: "mock",
    AUTH_OTP_MOCK: "1",
    FINANCIAL_CHAT_E2E_DATASET: "generated",
    NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:4000",
    FRONTEND_ORIGIN: "http://127.0.0.1:3000",
    PORT: "4000",
  };
  delete environment.CI;
  for (const [name, value] of Object.entries(changes)) {
    if (value === undefined) delete environment[name];
    else environment[name] = value;
  }
  return spawnSync(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test", "--list", "--config", "frontend/playwright.config.ts"],
    {
      cwd: checkout,
      env: environment,
      stdio: "ignore",
    },
  ).status;
}

async function validateFinancialExport(
  buffer: Buffer,
  expected: FinancialWorkbookSnapshot,
  classification: LegacyProof["evidence"]["classification"] = "generated",
): Promise<void> {
  const workbook = new Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (error) {
    if (classification === "generated") throw error;
    await writeFile(
      join(evidenceDirectory(), "real-source-export-parse-mismatch.json"),
      `${JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2)}\n`,
    );
    throw new Error("Real-source export could not be parsed; details are in the trusted evidence directory");
  }
  const actual = workbook.worksheets.map((worksheet) => {
    const rows: FinancialWorkbookSnapshot[number]["rows"] = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const values: FinancialWorkbookSnapshot[number]["rows"][number] = [];
      for (let column = 1; column <= row.cellCount; column += 1) {
        values.push(snapshotCell(row.getCell(column).value));
      }
      rows.push(values);
    });
    return { name: worksheet.name, rows };
  });
  if (classification === "generated" && !isDeepStrictEqual(actual, expected)) {
    throw new Error("Downloaded Financial MIS workbook does not match the recorded baseline");
  }
  await baselineMismatch("export", actual, expected, classification);
}

function snapshotCell(value: CellValue): string | number | boolean | null {
  const resolved =
    typeof value === "object" && value !== null && ("formula" in value || "sharedFormula" in value)
      ? (value.result ?? null)
      : value;
  if (resolved === null || resolved === undefined) return null;
  if (resolved instanceof Date) return resolved.toISOString();
  if (typeof resolved === "string" || typeof resolved === "number" || typeof resolved === "boolean") return resolved;
  if ("richText" in resolved) return resolved.richText.map(({ text }) => text).join("");
  if ("error" in resolved) return resolved.error;
  return String(resolved);
}
