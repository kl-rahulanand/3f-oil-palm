import { Workbook, type Cell, type CellValue, type Row, type Worksheet } from "exceljs";
import { z } from "zod";

export type SourceRow = Record<string, string | null>;

export interface FinancialTable {
  worksheet: Worksheet;
  headerRowNumber: number;
  columns: ReadonlyMap<string, number>;
  rawColumns: ReadonlyArray<readonly [key: string, column: number]>;
}

export interface MoneyEvidence {
  raw: string | null;
  rounded: string;
  roundingDelta: string;
}

export interface ParsedMoney {
  paise: bigint;
  evidence: MoneyEvidence;
  delta: ExactDecimal;
}

export interface ExactDecimal {
  coefficient: bigint;
  scale: number;
}

const MAX_MONEY_PAISE = 999_999_999_999_999_999n;

export async function readFinancialWorkbook(buffer: Buffer): Promise<Workbook> {
  const workbook = new Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw financialValidationError([financialIssue(["file"], "Workbook is not a readable .xlsx file")]);
  }
  return workbook;
}

export function findFinancialTable(
  worksheets: Worksheet[],
  requiredHeaders: readonly string[],
): FinancialTable | undefined {
  for (const worksheet of worksheets) {
    let found: FinancialTable | undefined;
    worksheet.eachRow((row, rowNumber) => {
      if (found) return;
      const columns = new Map<string, number>();
      const rawColumns: Array<readonly [string, number]> = [];
      const counts = new Map<string, number>();
      row.eachCell((cell, column) => {
        const header = cellText(cell);
        if (!header) return;
        if (!columns.has(header)) columns.set(header, column);
        const count = (counts.get(header) ?? 0) + 1;
        counts.set(header, count);
        rawColumns.push([count === 1 ? header : `${header}_${count}`, column]);
      });
      if (requiredHeaders.every((header) => columns.has(header))) {
        found = { worksheet, headerRowNumber: rowNumber, columns, rawColumns };
      }
    });
    if (found) return found;
  }
  return undefined;
}

export function column(table: FinancialTable, header: string): number {
  return table.columns.get(header)!;
}

export function rawColumn(table: FinancialTable, key: string): number | undefined {
  return table.rawColumns.find(([candidate]) => candidate === key)?.[1];
}

export function readSourceRow(row: Row, table: FinancialTable): SourceRow {
  return Object.fromEntries(
    table.rawColumns.map(([key, columnNumber]) => [key, cellSourceValue(row.getCell(columnNumber))]),
  );
}

export function cellSourceValue(cell: Cell): string | null {
  const value = formulaResult(cell.value);
  if (value instanceof Date) return validDate(value) ? formatDate(value) : String(value);
  if (isCellError(value)) return value.error;
  if (typeof value === "object" && value !== null && "richText" in value) {
    return value.richText.map(({ text }) => text).join("");
  }
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

export function cellText(cell: Cell): string {
  return cellSourceValue(cell)?.trim() ?? "";
}

export function formulaCacheIssue(cell: Cell): string | undefined {
  const value = cell.value;
  if (typeof value !== "object" || value === null || !("formula" in value || "sharedFormula" in value)) {
    return undefined;
  }
  if (value.result === null || value.result === undefined) {
    return "Formula has no cached result; recalculate and save the workbook";
  }
  return isCellError(value.result)
    ? "Formula cached result is an Excel error; recalculate and save the workbook"
    : undefined;
}

export function parseFinancialDate(cell: Cell): string | undefined {
  const value = formulaResult(cell.value);
  if (value instanceof Date) return validDate(value) ? formatDate(value) : undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000);
    return validDate(date) ? formatDate(date) : undefined;
  }
  if (typeof value !== "string") return undefined;
  const input = value.trim();
  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return validDateParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = input.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return dmy ? validDateParts(Number(dmy[3]), Number(dmy[2]), Number(dmy[1])) : undefined;
}

export function parseFinancialMoney(
  cell: Cell,
  path: Array<string | number>,
  issues: z.ZodIssue[],
  blankAsZero = true,
): ParsedMoney | undefined {
  const cacheIssue = formulaCacheIssue(cell);
  if (cacheIssue) {
    issues.push(financialIssue(path, cacheIssue));
    return undefined;
  }
  const text = cellText(cell);
  const source = text || null;
  if (source === null && !blankAsZero) return undefined;
  const decimal = parseDecimal(source ?? "0", typeof formulaResult(cell.value) === "number");
  if (!decimal) {
    issues.push(financialIssue(path, `${String(path.at(-1))} is not valid money`));
    return undefined;
  }
  const paise = roundToPaise(decimal);
  if (absolute(paise) > MAX_MONEY_PAISE) {
    issues.push(financialIssue(path, `${String(path.at(-1))} exceeds numeric(18,2)`));
    return undefined;
  }
  const deltaScale = Math.max(decimal.scale, 2);
  const roundedAtScale = paise * powerOfTen(deltaScale - 2);
  const rawAtScale = decimal.coefficient * powerOfTen(deltaScale - decimal.scale);
  const delta = { coefficient: roundedAtScale - rawAtScale, scale: deltaScale };
  return {
    paise,
    evidence: {
      raw: source,
      rounded: formatPaise(paise),
      roundingDelta: formatDecimal(delta),
    },
    delta,
  };
}

export function addDecimal(left: ExactDecimal, right: ExactDecimal): ExactDecimal {
  const scale = Math.max(left.scale, right.scale);
  return {
    coefficient:
      left.coefficient * powerOfTen(scale - left.scale) + right.coefficient * powerOfTen(scale - right.scale),
    scale,
  };
}

export function formatDecimal(value: ExactDecimal): string {
  const sign = value.coefficient < 0n ? "-" : "";
  const magnitude = absolute(value.coefficient)
    .toString()
    .padStart(value.scale + 1, "0");
  if (value.scale === 0) return `${sign}${magnitude}`;
  return `${sign}${magnitude.slice(0, -value.scale)}.${magnitude.slice(-value.scale)}`;
}

export function formatPaise(paise: bigint): string {
  return formatDecimal({ coefficient: paise, scale: 2 });
}

export function financialIssue(path: Array<string | number>, message: string): z.ZodIssue {
  return { code: z.ZodIssueCode.custom, path, message };
}

export function financialValidationError(issues: z.ZodIssue[]): z.ZodError {
  return new z.ZodError(issues);
}

function formulaResult(value: CellValue): CellValue {
  if (typeof value === "object" && value !== null && ("formula" in value || "sharedFormula" in value)) {
    return value.result ?? null;
  }
  return value;
}

function isCellError(value: CellValue): value is Extract<CellValue, { error: string }> {
  return typeof value === "object" && value !== null && "error" in value;
}

function parseDecimal(input: string, allowExponent: boolean): ExactDecimal | undefined {
  const normalized = input.replaceAll(",", "").replace(/^\+/, "");
  const pattern = allowExponent
    ? /^(-?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i
    : /^(-?)(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/;
  if (!pattern.test(allowExponent ? normalized : input.replace(/^\+/, ""))) return undefined;
  const match = normalized.match(/^(-?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if (!match) return undefined;
  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? 0);
  if (!Number.isSafeInteger(exponent)) return undefined;
  let coefficient = BigInt(`${match[2]}${fraction}` || "0");
  let scale = fraction.length - exponent;
  if (scale < 0) {
    coefficient *= powerOfTen(-scale);
    scale = 0;
  }
  if (match[1] === "-") coefficient = -coefficient;
  return { coefficient, scale };
}

function roundToPaise(value: ExactDecimal): bigint {
  if (value.scale <= 2) return value.coefficient * powerOfTen(2 - value.scale);
  const divisor = powerOfTen(value.scale - 2);
  const magnitude = absolute(value.coefficient);
  const quotient = magnitude / divisor;
  const remainder = magnitude % divisor;
  const rounded = quotient + (remainder * 2n >= divisor ? 1n : 0n);
  return value.coefficient < 0n ? -rounded : rounded;
}

function powerOfTen(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

function validDateParts(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? formatDate(date)
    : undefined;
}

function validDate(date: Date): boolean {
  return Number.isFinite(date.getTime());
}

function formatDate(date: Date): string {
  return `${date.getUTCFullYear().toString().padStart(4, "0")}-${(date.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}-${date.getUTCDate().toString().padStart(2, "0")}`;
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}
