import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { expect, type APIRequestContext, type BrowserContext, type Page, test } from "@playwright/test";
import { Workbook, type CellValue } from "exceljs";
import { trustedTaskDirectory } from "../playwright.config";

const API_BASE = "http://127.0.0.1:4000";
const SOURCE_MODE = process.env.FINANCIAL_CHAT_E2E_DATASET;
const GENERATED_PERIOD = "2026-04-01";
const GENERATED_ACTUAL = "175.00";
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
  test("proof controls reject unsafe runtime settings, linked evidence paths, and invalid exports", async () => {
    expect(configExit({ BIND_HOST: "0.0.0.0" })).not.toBe(0);
    expect(configExit({ WAREHOUSE_DRIVER: "http" })).not.toBe(0);
    expect(configExit({ NEXT_PUBLIC_API_BASE_URL: "https://example.invalid" })).not.toBe(0);
    expect(configExit({ FRONTEND_ORIGIN: "https://example.invalid" })).not.toBe(0);
    expect(configExit({ PORT: "4100" })).not.toBe(0);

    const junctionRoot = await mkdtemp(join(tmpdir(), "3f-financial-evidence-control-"));
    const junction = join(junctionRoot, "3f-financial-linked-evidence");
    await symlink(resolve(__dirname, "../.."), junction, "junction");
    const previousEvidenceDirectory = process.env.FINANCIAL_CHAT_E2E_EVIDENCE_DIR;
    process.env.FINANCIAL_CHAT_E2E_EVIDENCE_DIR = junction;
    try {
      expect(() => evidenceDirectory()).toThrow(/trusted task temporary directory/);
    } finally {
      if (previousEvidenceDirectory === undefined) delete process.env.FINANCIAL_CHAT_E2E_EVIDENCE_DIR;
      else process.env.FINANCIAL_CHAT_E2E_EVIDENCE_DIR = previousEvidenceDirectory;
      await rm(junctionRoot, { recursive: true, force: true });
    }

    await expect(validateFinancialExport(Buffer.from("not an xlsx"), GENERATED_EXPORT)).rejects.toThrow();
    const wrong = new Workbook();
    wrong.addWorksheet("Financial MIS").addRow(["Grand Total", 999]);
    await expect(
      validateFinancialExport(Buffer.from(await wrong.xlsx.writeBuffer()), GENERATED_EXPORT),
    ).rejects.toThrow(/does not match the recorded baseline/);
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

    await exerciseLegacyScreens(page, {
      period: GENERATED_PERIOD,
      expectedActual: GENERATED_ACTUAL,
      expectedExport: GENERATED_EXPORT,
      evidence: {
        classification: "generated",
        sourceSha256: generated.sha256,
        actualBatchIds: [requiredString(actualLoad, "batchId")],
        budgetBatchIds: requiredStringArray(budgetLoad, "periods", "batchId"),
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
      period: baseline.scope.period,
      expectedActual: baseline.actual,
      expectedExport: baseline.exportSnapshot,
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
  period: string;
  expectedActual: string;
  expectedExport: FinancialWorkbookSnapshot;
  evidence: {
    classification: "generated" | "real-source";
    sourceSha256: string;
    actualBatchIds: string[];
    budgetBatchIds: string[];
  };
}

type FinancialWorkbookSnapshot = Array<{
  name: string;
  rows: Array<Array<string | number | boolean | null>>;
}>;

async function exerciseLegacyScreens(page: Page, proof: LegacyProof): Promise<void> {
  await page.goto("/mis-reports");
  await expect(page.getByRole("heading", { name: "MIS Reports" })).toBeVisible();
  await page.getByLabel("Department").selectOption("Agriculture");
  await page.getByLabel("Function").selectOption("Nursery");
  await page.getByLabel("Plant").selectOption("DUB");
  await page.getByLabel("Period").selectOption(proof.period);
  await page.getByRole("button", { name: "Generate" }).click();

  const statement = page.getByRole("treegrid", { name: "Financial MIS statement" });
  await expect(statement).toBeVisible();
  const grandTotal = statement.getByRole("row", { name: "Grand total" });
  await expect(grandTotal.getByRole("button", { name: /Drill down Actual/ }).first()).toContainText(
    formatMoney(proof.expectedActual),
  );
  await capture(page, proof.evidence.classification, "report");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Excel" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    `financial-mis-agriculture-nursery-dub-${proof.period}-to-${proof.period}.xlsx`,
  );
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  await validateFinancialExport(Buffer.concat(chunks), proof.expectedExport);

  const nonzeroLeaf = statement
    .locator("tbody")
    .getByRole("button", { name: /Drill down Actual/ })
    .filter({ hasNotText: /^₹0(?:\.00)?$/ })
    .first();
  const selectedDrillButton = (await nonzeroLeaf.count())
    ? nonzeroLeaf
    : grandTotal.getByRole("button", { name: /Drill down Actual/ }).first();
  const clickedActual = (await selectedDrillButton.textContent())!.trim();
  await selectedDrillButton.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(clickedActual);
  const matchingTotal = dialog.getByText(/Matches the Actual in the report/);
  const transactionButton = dialog
    .getByRole("button")
    .filter({ hasText: /₹/ })
    .filter({ hasNotText: /^₹0(?:\.00)?$/ })
    .first();
  await expect.poll(async () => (await matchingTotal.isVisible()) || (await transactionButton.isVisible())).toBe(true);
  if (!(await matchingTotal.isVisible())) {
    await transactionButton.click();
  }
  await expect(matchingTotal).toBeVisible();
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

  await recordEvidence(proof, page.url());
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
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
  exportSnapshot: FinancialWorkbookSnapshot;
}> {
  const sourcePath = process.env.FINANCIAL_CHAT_SOURCE_FILE;
  const baselineDirectory = process.env.FINANCIAL_CHAT_BASELINE_DIR;
  if (!sourcePath || !baselineDirectory || !existsSync(sourcePath)) {
    throw new Error("real-source proof requires FINANCIAL_CHAT_SOURCE_FILE and FINANCIAL_CHAT_BASELINE_DIR");
  }
  const artifact = JSON.parse(await readFile(join(baselineDirectory, "legacy-backend-baseline.json"), "utf8")) as {
    sourceSha256: string;
    actualBatchIds: string[];
    budgetBatchIds: string[];
    scope: { period: string };
    report: { grandTotal: { measures: Array<{ actual: string }> } };
    exportSnapshot: FinancialWorkbookSnapshot;
  };
  const sourceSha256 = createHash("sha256")
    .update(await readFile(sourcePath))
    .digest("hex");
  expect(sourceSha256).toBe("8af9040a4a1096fbd182709b826d77df536ea55928e1deffd86bd14293c76810");
  expect(artifact.sourceSha256).toBe(sourceSha256);
  return { ...artifact, actual: artifact.report.grandTotal.measures[0]!.actual };
}

async function capture(page: Page, classification: string, name: string): Promise<void> {
  const directory = evidenceDirectory();
  await page.screenshot({ path: join(directory, `${classification}-${name}.png`), fullPage: true });
}

async function recordEvidence(proof: LegacyProof, finalUrl: string): Promise<void> {
  const directory = evidenceDirectory();
  await writeFile(
    join(directory, `${proof.evidence.classification}-legacy-ui-evidence.json`),
    `${JSON.stringify({ ...proof.evidence, period: proof.period, expectedActual: proof.expectedActual, finalUrl, capturedAtUtc: new Date().toISOString() }, null, 2)}\n`,
  );
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
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function configExit(changes: Record<string, string>): number | null {
  const checkout = resolve(__dirname, "../..");
  return spawnSync(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test", "--list", "--config", "frontend/playwright.config.ts"],
    {
      cwd: checkout,
      env: {
        ...process.env,
        BIND_HOST: "127.0.0.1",
        WAREHOUSE_DRIVER: "postgres",
        ...changes,
      },
      stdio: "ignore",
    },
  ).status;
}

async function validateFinancialExport(buffer: Buffer, expected: FinancialWorkbookSnapshot): Promise<void> {
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
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
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error("Downloaded Financial MIS workbook does not match the recorded baseline");
  }
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
