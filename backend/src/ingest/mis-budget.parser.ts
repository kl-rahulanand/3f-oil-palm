import { Workbook, type Cell, type CellValue, type Row, type Worksheet } from "exceljs";
import { z } from "zod";
import { MAPPING_MASTER, budgetLeafKeysForFormat } from "../mapping/mapping-master";
import type { MisBudgetInput, MisBudgetOutlineInput } from "../warehouse/ingestion.repository";
import { MAX_ACTUALS_ROWS } from "./ingest.schemas";
import { misFormatSlug, stableMisLeafKey } from "./mis-format-outline";
import { assertWorkbookArchiveWithinLimits, WorkbookArchiveLimitError, WorkbookRowLimitError } from "./workbook-guard";

export const MIS_BUDGET_FORMAT_ID = "nursery-mis-financial-v1";
export const MIS_BUDGET_PLANT = "DUB";
const REQUIRED_HEADERS = ["S. No.", "Budget Components", "GL Codes"] as const;
const PERIOD_SUBHEADERS = ["Budget", "Roll Over Budget", "Actual", "%"] as const;
const MAX_NUMERIC_PAISE = 999_999_999_999_999_999n;

export interface ParsedMisBudgetPeriod {
  period: string;
  rows: MisBudgetInput[];
}

export interface ParsedMisBudget {
  formatId: string;
  plant: string;
  outline: MisBudgetOutlineInput[];
  periods: ParsedMisBudgetPeriod[];
  totalRowCount: number;
  validationResult: Record<string, unknown>;
}

interface LocatedTable {
  worksheet: Worksheet;
  rowNumber: number;
  columns: Map<string, number>;
}

interface PeriodColumns {
  period: string;
  budget: number;
  rollover: number;
}

interface OutlineParent {
  nodeKey: string;
  sNo?: string;
}

export async function parseMisBudgetWorkbook(buffer: Buffer, rowLimit = MAX_ACTUALS_ROWS): Promise<ParsedMisBudget> {
  const workbook = new Workbook();
  try {
    await assertWorkbookArchiveWithinLimits(buffer, rowLimit);
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (error) {
    if (error instanceof WorkbookArchiveLimitError || error instanceof WorkbookRowLimitError) throw error;
    throw validationError([issue(["file"], "Workbook is not a readable .xlsx file")]);
  }

  const table = findTable(workbook.worksheets);
  if (!table) throw validationError([issue(["file", "headers"], "Required MIS budget headers were not found")]);

  const issues: z.ZodIssue[] = [];
  const periods = findPeriodColumns(table, issues);
  if (!periods.length) issues.push(issue(["file", "headers"], "No monthly budget blocks were found"));

  const outline: MisBudgetOutlineInput[] = [];
  const outlineKeys = new Set<string>();
  const outlineStack: OutlineParent[] = [];
  const rowsByPeriod = new Map(periods.map(({ period }) => [period, [] as MisBudgetInput[]]));
  const identities = new Set<string>();
  let glRowCount = 0;
  let uncomputedRolloverCount = 0;
  for (let rowNumber = table.rowNumber + 2; rowNumber <= table.worksheet.rowCount; rowNumber += 1) {
    const row = table.worksheet.getRow(rowNumber);
    if (startsNewTable(row)) break;
    const labelCell = row.getCell(requiredColumn(table, "Budget Components"));
    const label = cellText(labelCell);
    const glCode = cellText(row.getCell(requiredColumn(table, "GL Codes")));
    const subtotal = periods.some(({ budget }) => isSubtotal(row.getCell(budget)));
    if (!label) {
      if (!glCode) continue;
      glRowCount += 1;
      assertRowLimit(outline.length, glRowCount, periods.length, rowLimit);
      issues.push(issue(["rows", row.number, "costCenter"], "Budget Components is required for a GL row"));
      for (const columns of periods) {
        parseMoney(row.getCell(columns.budget), row.number, "budgetAmount", issues);
        const rolloverCell = row.getCell(columns.rollover);
        if (isFormula(rolloverCell.value) && typeof rolloverCell.value.result !== "number") {
          uncomputedRolloverCount += 1;
        } else {
          parseMoney(rolloverCell, row.number, "rolloverAmount", issues);
        }
      }
      continue;
    }
    if (!glCode && !subtotal) continue;

    const depth = labelCell.alignment?.indent ?? 0;
    const parent = depth ? outlineStack[depth - 1] : undefined;
    if (depth && !parent) {
      issues.push(issue(["rows", row.number, "outline"], "Outline node has no parent"));
      continue;
    }
    const sNo = cellText(row.getCell(requiredColumn(table, "S. No."))) || undefined;
    const identitySNo = sNo ?? parent?.sNo;
    if (!subtotal && !identitySNo) {
      issues.push(issue(["rows", row.number, "sNo"], "Leaf requires an S. No. or a numbered parent"));
      continue;
    }
    const leafKey = subtotal ? undefined : stableMisLeafKey(identitySNo!, glCode, label);
    const nodeKey = leafKey ? `leaf:${leafKey}` : `node:${identitySNo ?? "root"}|${misFormatSlug(label)}`;
    if (outlineKeys.has(nodeKey)) {
      issues.push(issue(["rows", row.number, "outline"], "Outline node identity is duplicated"));
      continue;
    }
    outlineKeys.add(nodeKey);
    outline.push({
      nodeKey,
      parentKey: parent?.nodeKey,
      depth,
      sNo,
      label,
      sortOrder: outline.length,
      glCode: leafKey ? glCode : undefined,
      leafKey,
    });
    assertRowLimit(outline.length, glRowCount, periods.length, rowLimit);
    outlineStack[depth] = { nodeKey, sNo: identitySNo };
    outlineStack.length = depth + 1;

    if (subtotal) continue;
    glRowCount += 1;
    assertRowLimit(outline.length, glRowCount, periods.length, rowLimit);
    if (!/^\d{6,}$/.test(glCode)) {
      issues.push(issue(["rows", row.number, "glCode"], "GL Codes must be a numeric GL code"));
      continue;
    }

    const costCenter = label;
    const lineId = String(row.number);
    for (const columns of periods) {
      const budgetAmount = parseMoney(row.getCell(columns.budget), row.number, "budgetAmount", issues);
      const rolloverCell = row.getCell(columns.rollover);
      const rolloverAmount =
        isFormula(rolloverCell.value) && typeof rolloverCell.value.result !== "number"
          ? ((uncomputedRolloverCount += 1), 0n)
          : parseMoney(rolloverCell, row.number, "rolloverAmount", issues);
      if (budgetAmount === undefined || rolloverAmount === undefined) continue;

      const identity = [MIS_BUDGET_FORMAT_ID, columns.period, leafKey].join("\u0000");
      if (identities.has(identity)) {
        issues.push(issue(["rows", row.number, "grain"], "Budget row grain is duplicated"));
        continue;
      }
      identities.add(identity);
      rowsByPeriod.get(columns.period)!.push({
        formatId: MIS_BUDGET_FORMAT_ID,
        period: columns.period,
        lineId,
        leafKey,
        glCode,
        costCenter,
        budgetAmount: formatPaise(budgetAmount),
        rolloverAmount: formatPaise(rolloverAmount),
      });
    }
  }

  if (!glRowCount) issues.push(issue(["rows"], "Workbook contains no GL rows"));
  if (issues.length) throw validationError(issues);

  const parsedPeriods = periods.map(({ period }) => ({ period, rows: rowsByPeriod.get(period)! }));
  const totalRowCount = parsedPeriods.reduce((total, current) => total + current.rows.length, 0);
  const outlineLeafKeys = new Set(outline.flatMap(({ leafKey }) => (leafKey ? [leafKey] : [])));
  const mappingDriftLeafKeys = budgetLeafKeysForFormat(MIS_BUDGET_FORMAT_ID, MAPPING_MASTER).filter(
    (leafKey) => !outlineLeafKeys.has(leafKey),
  );
  return {
    formatId: MIS_BUDGET_FORMAT_ID,
    plant: MIS_BUDGET_PLANT,
    outline,
    periods: parsedPeriods,
    totalRowCount,
    validationResult: {
      valid: true,
      formatId: MIS_BUDGET_FORMAT_ID,
      plant: MIS_BUDGET_PLANT,
      periodCount: parsedPeriods.length,
      glRowCount,
      rowCount: totalRowCount,
      headerRow: table.rowNumber,
      uncomputedRolloverCount,
      mappingDriftLeafKeys,
      mappingDriftCount: mappingDriftLeafKeys.length,
    },
  };
}

function assertRowLimit(outlineCount: number, glRowCount: number, periodCount: number, rowLimit: number): void {
  if ((outlineCount + glRowCount) * periodCount > rowLimit) throw new WorkbookRowLimitError(rowLimit);
}

function findTable(worksheets: Worksheet[]): LocatedTable | undefined {
  for (const worksheet of worksheets) {
    let located: LocatedTable | undefined;
    worksheet.eachRow((row, rowNumber) => {
      if (located) return;
      const columns = new Map<string, number>();
      row.eachCell((cell, column) => {
        const header = normalizeHeader(cellText(cell));
        if (header && !columns.has(header)) columns.set(header, column);
      });
      if (REQUIRED_HEADERS.every((header) => columns.has(header))) located = { worksheet, rowNumber, columns };
    });
    if (located) return located;
  }
  return undefined;
}

function findPeriodColumns(table: LocatedTable, issues: z.ZodIssue[]): PeriodColumns[] {
  const header = table.worksheet.getRow(table.rowNumber);
  const subheader = table.worksheet.getRow(table.rowNumber + 1);
  const periods: PeriodColumns[] = [];
  header.eachCell((cell, column) => {
    if (cell.isMerged && cell.master.address !== cell.address) return;
    const value = formulaResult(cell.value);
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return;
    const period = firstOfMonth(value);
    if (!period) {
      issues.push(
        issue(
          ["file", "headers", value.toISOString().slice(0, 10)],
          "Monthly block date must be the first of the month",
        ),
      );
      return;
    }
    const names = PERIOD_SUBHEADERS.map((_, offset) => normalizeHeader(cellText(subheader.getCell(column + offset))));
    if (!PERIOD_SUBHEADERS.every((name, index) => names[index] === name)) {
      issues.push(issue(["file", "headers", period], "Monthly block headers are invalid"));
      return;
    }
    periods.push({ period, budget: column, rollover: column + 1 });
  });
  return periods;
}

function firstOfMonth(value: CellValue): string | undefined {
  const resolved = formulaResult(value);
  if (!(resolved instanceof Date) || !Number.isFinite(resolved.getTime()) || resolved.getUTCDate() !== 1)
    return undefined;
  return `${resolved.getUTCFullYear().toString().padStart(4, "0")}-${(resolved.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}-01`;
}

function parseMoney(cell: Cell, row: number, column: string, issues: z.ZodIssue[]): bigint | undefined {
  const raw = cell.value;
  if (isFormula(raw)) {
    if (typeof raw.result !== "number") {
      issues.push(issue(["rows", row, column], `${column} formula requires a cached numeric result`));
      return undefined;
    }
    return numericPaise(raw.result, row, column, issues);
  }
  if (typeof raw === "number") return numericPaise(raw, row, column, issues);
  if (raw === null || raw === undefined || raw === "") return 0n;
  if (typeof raw !== "string") {
    issues.push(issue(["rows", row, column], `${column} must be numeric`));
    return undefined;
  }

  const input = raw.trim();
  if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(input)) {
    issues.push(issue(["rows", row, column], `${column} must be numeric`));
    return undefined;
  }
  const match = input.replaceAll(",", "").match(/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/)!;
  const paise = BigInt(match[2]) * 100n + BigInt((match[3] ?? "").padEnd(2, "0"));
  return boundedPaise(match[1] === "-" ? -paise : paise, row, column, issues);
}

function numericPaise(value: number, row: number, column: string, issues: z.ZodIssue[]): bigint | undefined {
  const scaled = Math.abs(value) * 100;
  const rounded = Math.round(scaled + Math.min(Number.EPSILON * scaled, 1e-7));
  if (!Number.isFinite(value) || !Number.isSafeInteger(rounded)) {
    issues.push(issue(["rows", row, column], `${column} must be numeric`));
    return undefined;
  }
  return boundedPaise(BigInt(value < 0 ? -rounded : rounded), row, column, issues);
}

function boundedPaise(value: bigint, row: number, column: string, issues: z.ZodIssue[]): bigint | undefined {
  if ((value < 0n ? -value : value) <= MAX_NUMERIC_PAISE) return value;
  issues.push(issue(["rows", row, column], `${column} exceeds numeric(18,2)`));
  return undefined;
}

function isFormula(value: CellValue): value is Extract<CellValue, { formula: string }> {
  return typeof value === "object" && value !== null && ("formula" in value || "sharedFormula" in value);
}

function isSubtotal(cell: Cell): boolean {
  return /\$?[A-Z]{1,3}\$?\d+/i.test(cell.formula);
}

function startsNewTable(row: Row): boolean {
  const first = cellText(row.getCell(1));
  return (
    /^Table-\d+/i.test(first) || /^Table-\d+/i.test(cellText(row.getCell(2))) || normalizeHeader(first) === "S. No."
  );
}

function formulaResult(value: CellValue): CellValue {
  return isFormula(value) ? (value.result ?? null) : value;
}

function cellText(cell: Cell): string {
  const value = formulaResult(cell.value);
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : "";
  if (typeof value === "object" && value !== null && "richText" in value) {
    return value.richText
      .map(({ text }) => text)
      .join("")
      .trim();
  }
  return value === null || value === undefined ? "" : String(value).trim();
}

function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function requiredColumn(table: LocatedTable, name: string): number {
  return table.columns.get(name)!;
}

function formatPaise(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

function issue(path: Array<string | number>, message: string): z.ZodIssue {
  return { code: z.ZodIssueCode.custom, path, message };
}

function validationError(issues: z.ZodIssue[]): z.ZodError {
  return new z.ZodError(issues);
}
