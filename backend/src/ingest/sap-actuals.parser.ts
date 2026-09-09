import { Workbook, type Cell, type CellValue, type Row, type Worksheet } from "exceljs";
import { z } from "zod";
import { MAX_ACTUALS_ROWS } from "./ingest.schemas";
import { canonicalPlant } from "./plant-mapping";

export const SAP_ACTUALS_REQUIRED_HEADERS = [
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
] as const;

export interface SapActualsRow {
  txnNo: string;
  lineId: string;
  postingDate: string;
  month: string;
  plant: string;
  plantSrc: string;
  costCenter: string;
  glCode: string;
  acctName: string;
  contraAccount?: string;
  debit: string;
  credit: string;
  actual: string;
  memo?: string;
  reference?: string;
  raw: Record<string, string>;
}

export interface ParsedSapActuals {
  period: string;
  rows: SapActualsRow[];
  validationResult: Record<string, unknown>;
}

export class SapActualsRowLimitError extends Error {
  constructor(readonly limit: number) {
    super(`Workbook exceeds ${limit} data rows`);
    this.name = "SapActualsRowLimitError";
  }
}

interface LocatedHeader {
  worksheet: Worksheet;
  rowNumber: number;
  columns: Map<string, number>;
  rawKeys: string[];
}

export async function parseSapActualsWorkbook(buffer: Buffer, rowLimit = MAX_ACTUALS_ROWS): Promise<ParsedSapActuals> {
  const workbook = new Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw validationError([issue(["file"], "Workbook is not a readable .xlsx file")]);
  }

  const header = findHeader(workbook.worksheets);
  if (!header) {
    throw validationError([issue(["file", "headers"], "Required SAP headers were not found")]);
  }

  const issues: z.ZodIssue[] = [];
  const rows: SapActualsRow[] = [];
  const identities = new Set<string>();
  let dataRowCount = 0;
  let period: string | undefined;

  for (let rowNumber = header.rowNumber + 1; rowNumber <= header.worksheet.rowCount; rowNumber += 1) {
    const row = header.worksheet.getRow(rowNumber);
    const raw = rawRow(row, header.rawKeys);
    if (Object.values(raw).every((value) => value === "")) continue;
    dataRowCount += 1;
    if (dataRowCount > rowLimit) {
      throw new SapActualsRowLimitError(rowLimit);
    }

    const rowIssues: z.ZodIssue[] = [];
    const text = (name: string) => cellText(row.getCell(requiredColumn(header, name)));
    const txnNo = requiredText(text("Transaction Number"), rowNumber, "txnNo", rowIssues);
    const sourceRowNumber = optionalText(row, header, "#");
    const lineId = text("Line_Id") || sourceRowNumber;
    if (!lineId) rowIssues.push(issue(["rows", rowNumber, "lineId"], "Line_Id or # is required"));

    const postingDate = parsePostingDate(row.getCell(requiredColumn(header, "Posting Date")));
    if (!postingDate) rowIssues.push(issue(["rows", rowNumber, "postingDate"], "Posting Date is invalid"));
    const rowPeriod = postingDate ? `${postingDate.slice(0, 7)}-01` : undefined;
    if (rowPeriod && !period) period = rowPeriod;
    if (rowPeriod && period && rowPeriod !== period) {
      rowIssues.push(issue(["rows", rowNumber, "month"], "Posting Date must be in one period"));
    }
    const monthToken = text("Month").trim().slice(0, 3).toLowerCase();
    if (!postingDate || monthToken !== MONTHS[Number(postingDate.slice(5, 7)) - 1]) {
      rowIssues.push(issue(["rows", rowNumber, "month"], "Month must match Posting Date"));
    }

    const plantSrc = requiredText(text("Plant"), rowNumber, "plant", rowIssues);
    const costCenter = requiredText(text("Cost Center"), rowNumber, "costCenter", rowIssues);
    const glCode = requiredText(text("MIS GL Code"), rowNumber, "glCode", rowIssues);
    const acctName = requiredText(text("AcctName"), rowNumber, "acctName", rowIssues);
    const debit = parseMoney(row.getCell(requiredColumn(header, "Debit")), rowNumber, "debit", rowIssues);
    const credit = parseMoney(row.getCell(requiredColumn(header, "Credit")), rowNumber, "credit", rowIssues);
    const actual = debit !== undefined && credit !== undefined ? debit - credit : undefined;
    if (actual !== undefined && absolute(actual) > MAX_NUMERIC_PAISE) {
      rowIssues.push(issue(["rows", rowNumber, "actual"], "Debit minus Credit exceeds numeric(18,2)"));
    }

    if (txnNo && lineId) {
      const identity = `${txnNo}\u0000${lineId}`;
      if (identities.has(identity)) {
        rowIssues.push(issue(["rows", rowNumber, "lineId"], "Transaction line is duplicated"));
      } else {
        identities.add(identity);
      }
    }

    issues.push(...rowIssues);
    if (
      rowIssues.length ||
      !postingDate ||
      !rowPeriod ||
      debit === undefined ||
      credit === undefined ||
      actual === undefined
    )
      continue;

    rows.push({
      txnNo,
      lineId,
      postingDate,
      month: rowPeriod,
      plant: canonicalPlant(plantSrc),
      plantSrc,
      costCenter,
      glCode,
      acctName,
      ...(text("ContraAct") ? { contraAccount: text("ContraAct") } : {}),
      debit: formatPaise(debit),
      credit: formatPaise(credit),
      actual: formatPaise(actual),
      ...(optionalText(row, header, "LineMemo") ? { memo: optionalText(row, header, "LineMemo") } : {}),
      ...(optionalText(row, header, "Reference 1") ? { reference: optionalText(row, header, "Reference 1") } : {}),
      raw,
    });
  }

  if (!rows.length && !issues.length) issues.push(issue(["rows"], "Workbook contains no data rows"));
  if (issues.length) throw validationError(issues);

  return {
    period: period!,
    rows,
    validationResult: {
      valid: true,
      rowCount: rows.length,
      period,
      headerRow: header.rowNumber,
    },
  };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MAX_NUMERIC_PAISE = 999_999_999_999_999_999n;

function findHeader(worksheets: Worksheet[]): LocatedHeader | undefined {
  for (const worksheet of worksheets) {
    for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const names = Array.from({ length: row.cellCount }, (_, index) => cellText(row.getCell(index + 1)));
      if (!SAP_ACTUALS_REQUIRED_HEADERS.every((required) => names.includes(required))) continue;

      const columns = new Map<string, number>();
      names.forEach((name, index) => {
        if (name && !columns.has(name)) columns.set(name, index + 1);
      });
      return { worksheet, rowNumber, columns, rawKeys: uniqueRawKeys(names) };
    }
  }
  return undefined;
}

function uniqueRawKeys(names: string[]): string[] {
  const counts = new Map<string, number>();
  return names.map((name, index) => {
    const base = name || `Column_${index + 1}`;
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

function rawRow(row: Row, headerKeys: string[]): Record<string, string> {
  const columnCount = Math.max(headerKeys.length, row.cellCount);
  return Object.fromEntries(
    Array.from({ length: columnCount }, (_, index) => [
      headerKeys[index] ?? `Column_${index + 1}`,
      cellText(row.getCell(index + 1)),
    ]),
  );
}

function requiredColumn(header: LocatedHeader, name: string): number {
  return header.columns.get(name)!;
}

function optionalText(row: Row, header: LocatedHeader, name: string): string {
  const column = header.columns.get(name);
  return column ? cellText(row.getCell(column)) : "";
}

function requiredText(value: string, row: number, column: string, issues: z.ZodIssue[]): string {
  if (!value) issues.push(issue(["rows", row, column], `${column} is required`));
  return value;
}

function cellText(cell: Cell): string {
  const value = formulaResult(cell.value);
  if (value instanceof Date) return formatDate(value);
  if (typeof value === "object" && value !== null && "richText" in value) {
    return value.richText
      .map(({ text }) => text)
      .join("")
      .trim();
  }
  return value === null || value === undefined ? "" : String(value).trim();
}

function formulaResult(value: CellValue): Exclude<CellValue, { formula: string }> | CellValue {
  if (typeof value === "object" && value !== null && "formula" in value) return value.result ?? null;
  return value;
}

function parsePostingDate(cell: Cell): string | undefined {
  const value = formulaResult(cell.value);
  if (value instanceof Date) return validDate(value) ? formatDate(value) : undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000);
    return validDate(date) ? formatDate(date) : undefined;
  }
  if (typeof value !== "string") return undefined;

  const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return validParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = value.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return dmy ? validParts(Number(dmy[3]), Number(dmy[2]), Number(dmy[1])) : undefined;
}

function validParts(year: number, month: number, day: number): string | undefined {
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

function parseMoney(cell: Cell, row: number, column: string, issues: z.ZodIssue[]): bigint | undefined {
  const value = formulaResult(cell.value);
  const input = value === null || value === undefined || value === "" ? "0" : String(value).trim();
  const normalized = input.replaceAll(",", "");
  const match = normalized.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) {
    issues.push(issue(["rows", row, column], `${column} must have at most two decimal places`));
    return undefined;
  }
  const paise = BigInt(match[2]) * 100n + BigInt((match[3] ?? "").padEnd(2, "0"));
  const signed = match[1] ? -paise : paise;
  if (absolute(signed) > MAX_NUMERIC_PAISE) {
    issues.push(issue(["rows", row, column], `${column} exceeds numeric(18,2)`));
    return undefined;
  }
  return signed;
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function formatPaise(paise: bigint): string {
  const sign = paise < 0n ? "-" : "";
  const absolute = paise < 0n ? -paise : paise;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

function issue(path: Array<string | number>, message: string): z.ZodIssue {
  return { code: z.ZodIssueCode.custom, path, message };
}

function validationError(issues: z.ZodIssue[]): z.ZodError {
  return new z.ZodError(issues);
}
