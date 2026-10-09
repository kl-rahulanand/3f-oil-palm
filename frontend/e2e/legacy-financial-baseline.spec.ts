import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { expect, type APIRequestContext, type BrowserContext, type Page, test } from "@playwright/test";
import { Workbook } from "exceljs";

const API_BASE = "http://127.0.0.1:4000";
const SOURCE_MODE = process.env.FINANCIAL_CHAT_E2E_DATASET;
const GENERATED_PERIOD = "2026-04-01";
const GENERATED_ACTUAL = "175.00";

test.describe("legacy financial BASELINE", () => {
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
  evidence: {
    classification: "generated" | "real-source";
    sourceSha256: string;
    actualBatchIds: string[];
    budgetBatchIds: string[];
  };
}

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
  expect(await download.createReadStream()).not.toBeNull();

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
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `${classification}-${name}.png`), fullPage: true });
}

async function recordEvidence(proof: LegacyProof, finalUrl: string): Promise<void> {
  const directory = evidenceDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, `${proof.evidence.classification}-legacy-ui-evidence.json`),
    `${JSON.stringify({ ...proof.evidence, period: proof.period, expectedActual: proof.expectedActual, finalUrl, capturedAtUtc: new Date().toISOString() }, null, 2)}\n`,
  );
}

function evidenceDirectory(): string {
  const directory = resolve(
    process.env.FINANCIAL_CHAT_E2E_EVIDENCE_DIR ?? join(tmpdir(), "3f-financial-legacy-ui-evidence"),
  );
  const checkout = resolve(__dirname, "../..");
  const temporaryRoot = resolve(tmpdir());
  const fromCheckout = relative(checkout, directory);
  const fromTemporaryRoot = relative(temporaryRoot, directory);
  if (
    !fromCheckout.startsWith("..") ||
    fromTemporaryRoot.startsWith("..") ||
    !basename(directory).startsWith("3f-financial-")
  ) {
    throw new Error(
      "legacy UI evidence requires a 3f-financial-* task directory outside Git under the system temp directory",
    );
  }
  return directory;
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
