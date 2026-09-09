import { Workbook, type Cell, type CellValue, type Row, type Worksheet } from "exceljs";
import JSZip, { type JSZipObject } from "jszip";
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

export class SapActualsArchiveLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SapActualsArchiveLimitError";
  }
}

interface LocatedHeader {
  worksheet: Worksheet;
  rowNumber: number;
  columns: Map<string, number>;
  rawColumns: Array<[key: string, column: number]>;
}

export async function parseSapActualsWorkbook(buffer: Buffer, rowLimit = MAX_ACTUALS_ROWS): Promise<ParsedSapActuals> {
  const workbook = new Workbook();
  try {
    await assertArchiveWithinLimits(buffer, rowLimit);
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (error) {
    if (error instanceof SapActualsArchiveLimitError || error instanceof SapActualsRowLimitError) throw error;
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

  const populatedRows: Row[] = [];
  header.worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > header.rowNumber) populatedRows.push(row);
  });
  for (const row of populatedRows) {
    const rowNumber = row.number;
    const raw = rawRow(row, header.rawColumns);
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
    const monthToken = text("Month").trim().toLowerCase();
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
const MAX_XLSX_ENTRIES = 256;
const MAX_XLSX_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;
const MAX_RAW_COLUMNS = 256;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_SIGNATURE = 0x06054b50;

async function assertArchiveWithinLimits(buffer: Buffer, rowLimit: number): Promise<void> {
  assertCentralDirectoryWithinLimits(buffer);
  const archive = await JSZip.loadAsync(buffer);
  const entries = Object.values(archive.files);
  if (entries.length > MAX_XLSX_ENTRIES) {
    throw new SapActualsArchiveLimitError(`Workbook exceeds ${MAX_XLSX_ENTRIES} ZIP entries`);
  }

  let uncompressedBytes = 0;
  let worksheetRows = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    ({ uncompressedBytes, worksheetRows } = await countEntryBytes(entry, uncompressedBytes, worksheetRows, rowLimit));
  }
}

function assertCentralDirectoryWithinLimits(buffer: Buffer): void {
  const endOffset = findZipEnd(buffer);
  if (buffer.readUInt16LE(endOffset + 4) || buffer.readUInt16LE(endOffset + 6)) {
    throw new Error("Multi-disk ZIP archives are not supported");
  }
  const expectedEntries = buffer.readUInt16LE(endOffset + 10);
  const centralSize = buffer.readUInt32LE(endOffset + 12);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  if (expectedEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error("ZIP64 archives are not supported");
  }
  if (expectedEntries > MAX_XLSX_ENTRIES) {
    throw new SapActualsArchiveLimitError(`Workbook exceeds ${MAX_XLSX_ENTRIES} ZIP entries`);
  }

  const centralEnd = centralOffset + centralSize;
  if (centralEnd > endOffset) throw new Error("Invalid ZIP central directory");
  let entries = 0;
  let declaredBytes = 0;
  let offset = centralOffset;
  while (offset < centralEnd) {
    if (offset + 46 > centralEnd || buffer.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("Invalid ZIP central directory");
    }
    declaredBytes += buffer.readUInt32LE(offset + 24);
    if (declaredBytes > MAX_XLSX_UNCOMPRESSED_BYTES) {
      throw new SapActualsArchiveLimitError(`Workbook exceeds ${MAX_XLSX_UNCOMPRESSED_BYTES} uncompressed bytes`);
    }
    entries += 1;
    if (entries > MAX_XLSX_ENTRIES) {
      throw new SapActualsArchiveLimitError(`Workbook exceeds ${MAX_XLSX_ENTRIES} ZIP entries`);
    }
    offset +=
      46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
    if (offset > centralEnd) throw new Error("Invalid ZIP central directory");
  }
  if (entries !== expectedEntries) throw new Error("Invalid ZIP entry count");
}

function findZipEnd(buffer: Buffer): number {
  const firstPossibleOffset = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= firstPossibleOffset; offset -= 1) {
    if (
      buffer.readUInt32LE(offset) === ZIP_END_SIGNATURE &&
      offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length
    ) {
      return offset;
    }
  }
  throw new Error("ZIP end record not found");
}

function countEntryBytes(
  entry: JSZipObject,
  initialBytes: number,
  initialRows: number,
  rowLimit: number,
): Promise<{ uncompressedBytes: number; worksheetRows: number }> {
  return new Promise((resolve, reject) => {
    const stream = entry.nodeStream();
    let bytes = initialBytes;
    let rows = initialRows;
    let rowTagState = 0;
    let settled = false;
    stream.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_XLSX_UNCOMPRESSED_BYTES) {
        return fail(
          new SapActualsArchiveLimitError(`Workbook exceeds ${MAX_XLSX_UNCOMPRESSED_BYTES} uncompressed bytes`),
        );
      }
      if (!/^xl\/worksheets\/[^/]+\.xml$/.test(entry.name)) return;
      const counted = countRowTags(chunk.toString("utf8"), rowTagState);
      rows += counted.rows;
      rowTagState = counted.state;
      if (rows > rowLimit + MAX_XLSX_ENTRIES) return fail(new SapActualsRowLimitError(rowLimit));
    });
    stream.on("error", (error) => {
      fail(error);
    });
    stream.on("end", () => {
      if (settled) return;
      settled = true;
      resolve({ uncompressedBytes: bytes, worksheetRows: rows });
    });

    function fail(error: Error): void {
      if (settled) return;
      settled = true;
      (stream as NodeJS.ReadableStream & { destroy(): void }).destroy();
      reject(error);
    }
  });
}

function countRowTags(xml: string, initialState: number): { rows: number; state: number } {
  const prefix = "<row";
  let rows = 0;
  let state = initialState;
  for (const character of xml) {
    if (state < prefix.length) {
      state = character === prefix[state] ? state + 1 : character === "<" ? 1 : 0;
      continue;
    }
    if (character === ">" || /\s/.test(character)) rows += 1;
    state = character === "<" ? 1 : 0;
  }
  return { rows, state };
}

function findHeader(worksheets: Worksheet[]): LocatedHeader | undefined {
  for (const worksheet of worksheets) {
    let located: LocatedHeader | undefined;
    worksheet.eachRow((row, rowNumber) => {
      if (located) return;
      const columns = new Map<string, number>();
      const rawColumns: LocatedHeader["rawColumns"] = [];
      const counts = new Map<string, number>();
      row.eachCell((cell, column) => {
        const name = cellText(cell);
        if (!name) return;
        if (rawColumns.length === MAX_RAW_COLUMNS) {
          throw new SapActualsArchiveLimitError(`Workbook exceeds ${MAX_RAW_COLUMNS} source columns`);
        }
        if (!columns.has(name)) columns.set(name, column);
        const count = (counts.get(name) ?? 0) + 1;
        counts.set(name, count);
        rawColumns.push([count === 1 ? name : `${name}_${count}`, column]);
      });
      if (SAP_ACTUALS_REQUIRED_HEADERS.every((required) => columns.has(required))) {
        located = { worksheet, rowNumber, columns, rawColumns };
      }
    });
    if (located) return located;
  }
  return undefined;
}

function rawRow(row: Row, columns: LocatedHeader["rawColumns"]): Record<string, string> {
  return Object.fromEntries(columns.map(([key, column]) => [key, cellText(row.getCell(column))]));
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
  if (typeof value === "number") {
    const scaled = value * 100;
    const rounded = Math.round(scaled);
    if (!Number.isFinite(value) || !Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > 1e-7) {
      issues.push(issue(["rows", row, column], `${column} must have at most two decimal places`));
      return undefined;
    }
    return BigInt(rounded);
  }

  const input = value === null || value === undefined || value === "" ? "0" : String(value).trim();
  if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(input)) {
    issues.push(issue(["rows", row, column], `${column} must have at most two decimal places`));
    return undefined;
  }
  const match = input.replaceAll(",", "").match(/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/)!;
  const paise = BigInt(match[2]) * 100n + BigInt((match[3] ?? "").padEnd(2, "0"));
  const signed = match[1] === "-" ? -paise : paise;
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
