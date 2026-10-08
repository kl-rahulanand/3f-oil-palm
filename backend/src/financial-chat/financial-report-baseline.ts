import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { UploadedWorkbook } from "../ingest/ingest.service";
import { Workbook, type CellValue, type Row, type Worksheet } from "exceljs";
import { assertTrustedFinancialBaselineDirectory } from "./financial-disposable-db.guard";

const ACTUAL_HEADERS = [
  "Transaction Number",
  "Line_Id",
  "Posting Date",
  "Month",
  "Plant",
  "Cost Center",
  "MIS GL Code",
  "Debit",
  "Credit",
  "ContraAct",
] as const;

export interface LegacyFinancialSource {
  sha256: string;
  actuals: Array<{ period: string; upload: UploadedWorkbook }>;
  budget: UploadedWorkbook;
  excludedActualRows: number;
  actualSourcePlants: string[];
}

export interface FinancialBaselineArtifact {
  sourceSha256: string;
  sourceName: string;
  actualBatchIds: string[];
  budgetBatchIds: string[];
  scope: { plant: string; period: string };
  report: unknown;
  exportSnapshot: FinancialWorkbookSnapshot;
  drill: unknown;
  ask: unknown;
}

export type FinancialWorkbookSnapshot = Array<{
  name: string;
  rows: Array<Array<string | number | boolean | null>>;
}>;

export function snapshotFinancialWorkbook(workbook: Workbook): FinancialWorkbookSnapshot {
  return workbook.worksheets.map((worksheet) => {
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
}

export async function prepareLegacyFinancialSource(path: string): Promise<LegacyFinancialSource> {
  const buffer = await readFile(path);
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const located = findActualTable(workbook.worksheets);
  if (!located) throw new Error("Financial source does not contain the legacy Actual headers");

  const grouped = new Map<string, Row[]>();
  const actualSourcePlants = new Set<string>();
  let excludedActualRows = 0;
  located.worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= located.headerRow || emptyRow(row, located.columns)) return;
    const plant = optional(row, located.columns, "Plant");
    if (plant) actualSourcePlants.add(plant);
    if (!legacyCompatible(row, located.columns)) {
      excludedActualRows += 1;
      return;
    }
    const period = reportingMonth(row.getCell(located.columns.get("Posting Date")!));
    if (!period) throw new Error(`Legacy-compatible Actual row ${rowNumber} has an invalid Posting Date`);
    grouped.set(period, [...(grouped.get(period) ?? []), row]);
  });

  const actuals: LegacyFinancialSource["actuals"] = [];
  for (const [period, rows] of [...grouped].sort(([left], [right]) => left.localeCompare(right))) {
    const monthly = new Workbook();
    const sheet = monthly.addWorksheet("Actual");
    const header = copyValues(located.worksheet.getRow(located.headerRow));
    header[(located.columns.get("AcctName") ?? located.columns.get("MIS GL Name"))! - 1] = "AcctName";
    sheet.addRow(header);
    rows.forEach((row) => sheet.addRow(copyValues(row)));
    const monthlyBuffer = Buffer.from(await monthly.xlsx.writeBuffer());
    actuals.push({ period, upload: upload(`${period}-Actual.xlsx`, monthlyBuffer) });
  }

  const budgetWorksheet = findBudgetWorksheet(workbook.worksheets);
  if (!budgetWorksheet) throw new Error("Financial source does not contain the legacy Budget headers");
  for (const worksheet of [...workbook.worksheets]) {
    if (worksheet.id !== budgetWorksheet.id) workbook.removeWorksheet(worksheet.id);
  }
  const budgetBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

  return {
    sha256: createHash("sha256").update(buffer).digest("hex"),
    actuals,
    budget: upload(basename(path), budgetBuffer),
    excludedActualRows,
    actualSourcePlants: [...actualSourcePlants].sort(),
  };
}

function findBudgetWorksheet(worksheets: Worksheet[]): Worksheet | undefined {
  return worksheets.find((worksheet) => {
    let found = false;
    worksheet.eachRow((row) => {
      const names = new Set<string>();
      row.eachCell((cell) => names.add(text(cell.value)));
      if (["S. No.", "Budget Components", "GL Codes"].every((name) => names.has(name))) found = true;
    });
    return found;
  });
}

export async function writeFinancialBaselineArtifact(
  artifact: FinancialBaselineArtifact,
  checkout: string,
  directory = join(tmpdir(), "3f-financial-chat-baseline"),
): Promise<string> {
  const target = assertTrustedFinancialBaselineDirectory(directory, checkout);
  await mkdir(target, { recursive: true });
  const metadataPath = join(target, "source-metadata.json");
  let metadataExists = false;
  try {
    const prior = JSON.parse(await readFile(metadataPath, "utf8")) as { sourceSha256?: string };
    metadataExists = true;
    if (prior.sourceSha256 && prior.sourceSha256 !== artifact.sourceSha256) {
      throw new Error("Financial source checksum changed; record a new source identity before replacing the baseline");
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const metadata = {
    sourceSha256: artifact.sourceSha256,
    sourceName: artifact.sourceName,
    actualBatchIds: artifact.actualBatchIds,
    budgetBatchIds: artifact.budgetBatchIds,
    scope: artifact.scope,
  };
  if (!metadataExists) await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  const artifactPath = join(target, "legacy-backend-baseline.json");
  try {
    const prior = JSON.parse(await readFile(artifactPath, "utf8")) as FinancialBaselineArtifact;
    if (!isDeepStrictEqual(prior, artifact)) {
      throw new Error("Current financial output does not match the captured financial baseline");
    }
    return artifactPath;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  return artifactPath;
}

interface ActualTable {
  worksheet: Worksheet;
  headerRow: number;
  columns: Map<string, number>;
}

function findActualTable(worksheets: Worksheet[]): ActualTable | undefined {
  for (const worksheet of worksheets) {
    let result: ActualTable | undefined;
    worksheet.eachRow((row, rowNumber) => {
      if (result) return;
      const columns = new Map<string, number>();
      row.eachCell((cell, column) => {
        const name = text(cell.value);
        if (name && !columns.has(name)) columns.set(name, column);
      });
      if (
        ACTUAL_HEADERS.every((name) => columns.has(name)) &&
        (columns.has("AcctName") || columns.has("MIS GL Name"))
      ) {
        result = { worksheet, headerRow: rowNumber, columns };
      }
    });
    if (result) return result;
  }
  return undefined;
}

function legacyCompatible(row: Row, columns: Map<string, number>): boolean {
  const required = ["Transaction Number", "Posting Date", "Plant", "Cost Center", "MIS GL Code"];
  return (
    required.every((name) => text(row.getCell(columns.get(name)!).value)) &&
    Boolean(optional(row, columns, "AcctName") || optional(row, columns, "MIS GL Name")) &&
    Boolean(text(row.getCell(columns.get("Line_Id")!).value) || optional(row, columns, "#"))
  );
}

function emptyRow(row: Row, columns: Map<string, number>): boolean {
  return [...columns.values()].every((column) => !text(row.getCell(column).value));
}

function reportingMonth(cell: { value: CellValue }): string | undefined {
  const value = formulaValue(cell.value);
  if (value instanceof Date) return `${value.toISOString().slice(0, 7)}-01`;
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000);
    return `${date.toISOString().slice(0, 7)}-01`;
  }
  const raw = text(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (iso) return `${iso[1]}-${iso[2]}-01`;
  const dmy = raw.match(/^\d{1,2}[/-](\d{1,2})[/-](\d{4})$/);
  return dmy ? `${dmy[2]}-${dmy[1]!.padStart(2, "0")}-01` : undefined;
}

function optional(row: Row, columns: Map<string, number>, name: string): string {
  const column = columns.get(name);
  return column ? text(row.getCell(column).value) : "";
}

function copyValues(row: Row): CellValue[] {
  const values: CellValue[] = [];
  for (let column = 1; column <= row.cellCount; column += 1) values.push(row.getCell(column).value);
  return values;
}

function text(value: CellValue): string {
  const resolved = formulaValue(value);
  if (resolved instanceof Date) return Number.isNaN(resolved.getTime()) ? "" : resolved.toISOString().slice(0, 10);
  if (typeof resolved === "object" && resolved !== null && "richText" in resolved) {
    return resolved.richText
      .map(({ text: part }) => part)
      .join("")
      .trim();
  }
  return resolved === null || resolved === undefined ? "" : String(resolved).trim();
}

function formulaValue(value: CellValue): CellValue {
  return typeof value === "object" && value !== null && ("formula" in value || "sharedFormula" in value)
    ? (value.result ?? null)
    : value;
}

function snapshotCell(value: CellValue): string | number | boolean | null {
  const resolved = formulaValue(value);
  if (resolved === null || resolved === undefined) return null;
  if (resolved instanceof Date) {
    if (Number.isNaN(resolved.getTime())) throw new Error("Financial export contains an invalid date");
    return resolved.toISOString();
  }
  if (typeof resolved === "string" || typeof resolved === "number" || typeof resolved === "boolean") return resolved;
  if ("richText" in resolved) return resolved.richText.map(({ text: part }) => part).join("");
  if ("error" in resolved) return resolved.error;
  return text(resolved);
}

function upload(originalname: string, buffer: Buffer): UploadedWorkbook {
  return {
    originalname,
    mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: buffer.length,
    buffer,
  };
}
