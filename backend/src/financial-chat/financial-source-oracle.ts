import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Workbook, type Cell, type CellValue, type Row, type Worksheet } from "exceljs";

interface BudgetPeriodEvidence {
  reportingMonth: string;
  budget: string | null;
  rollover: string | null;
}

interface BudgetHierarchyRow {
  sourceRow: number;
  parentSourceRow: number | null;
  outlineLevel: number;
  isLeaf: boolean;
  component: string;
  glCode: string | null;
  periods: BudgetPeriodEvidence[];
}

export interface FinancialSourceOracle {
  sha256: string;
  actual: {
    columns: string[];
    rows: Array<{
      sourceRow: number;
      sourceCells: Record<string, string | null>;
      transactionNumber: string | null;
      lineId: string | null;
      postingDate: string;
      plant: string | null;
      costCenter: string | null;
      glCode: string | null;
      debit: string | null;
      credit: string | null;
      section: string | null;
      origin: string | null;
      comments: string | null;
      comments2: string | null;
    }>;
    rowCount: number;
    debit: string;
    credit: string;
    actual: string;
    reportingMonths: string[];
    byPlantMonth: Array<{ plant: string | null; reportingMonth: string; rowCount: number; actual: string }>;
    legacyCompatible: {
      rowCount: number;
      excludedRowCount: number;
      byPlantMonth: Array<{ plant: string; reportingMonth: string; rowCount: number; actual: string }>;
    };
  };
  budget: {
    rowCount: number;
    hierarchy: BudgetHierarchyRow[];
    leaves: Array<{
      sourceRow: number;
      component: string;
      glCode: string | null;
      periods: BudgetPeriodEvidence[];
    }>;
    periods: Array<{ reportingMonth: string; leafCount: number; budget: string; rollover: string }>;
  };
}

const ACTUAL_HEADERS = ["Transaction Number", "Posting Date", "Plant", "Debit", "Credit"] as const;

export async function inspectFinancialSource(path: string): Promise<FinancialSourceOracle> {
  const buffer = await readFile(path);
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const actualHeader = locateHeader(workbook.worksheets, ACTUAL_HEADERS);
  const budgetHeader = locateHeader(workbook.worksheets, ["S. No.", "Budget Components", "GL Codes"]);
  if (!actualHeader || !budgetHeader)
    throw new Error("Financial source does not contain the expected Actual and Budget tables");

  return {
    sha256: createHash("sha256").update(buffer).digest("hex"),
    actual: inspectActual(actualHeader),
    budget: inspectBudget(budgetHeader),
  };
}

interface HeaderLocation {
  worksheet: Worksheet;
  row: number;
  columns: Array<{ name: string; column: number }>;
}

function locateHeader(worksheets: Worksheet[], required: readonly string[]): HeaderLocation | undefined {
  for (const worksheet of worksheets) {
    let found: HeaderLocation | undefined;
    worksheet.eachRow((row, rowNumber) => {
      if (found) return;
      const counts = new Map<string, number>();
      const columns: HeaderLocation["columns"] = [];
      row.eachCell((cell, column) => {
        const base = cellText(cell);
        if (!base) return;
        const count = (counts.get(base) ?? 0) + 1;
        counts.set(base, count);
        columns.push({ name: count === 1 ? base : `${base}_${count}`, column });
      });
      const names = new Set(columns.map(({ name }) => name));
      if (required.every((name) => names.has(name))) found = { worksheet, row: rowNumber, columns };
    });
    if (found) return found;
  }
  return undefined;
}

function inspectActual(header: HeaderLocation): FinancialSourceOracle["actual"] {
  let debit = 0n;
  let credit = 0n;
  let rowCount = 0;
  const byPlantMonth = new Map<
    string,
    { plant: string | null; reportingMonth: string; rowCount: number; actual: bigint }
  >();
  const legacyByPlantMonth = new Map<
    string,
    { plant: string; reportingMonth: string; rowCount: number; actual: bigint }
  >();
  let legacyRowCount = 0;
  const rows: FinancialSourceOracle["actual"]["rows"] = [];
  header.worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= header.row || isEmpty(row, header.columns)) return;
    const postingDate = dateText(cell(row, header, "Posting Date"));
    if (!postingDate) throw new Error(`Actual source row ${rowNumber} has an invalid Posting Date`);
    const debitLabel = `Actual row ${rowNumber} Debit`;
    const creditLabel = `Actual row ${rowNumber} Credit`;
    const debitText = financialText(cell(row, header, "Debit"), debitLabel);
    const creditText = financialText(cell(row, header, "Credit"), creditLabel);
    if (!debitText && !creditText) throw new Error(`Actual row ${rowNumber} Debit and Credit are missing`);
    const rowDebit = money(debitText || "0", debitLabel);
    const rowCredit = money(creditText || "0", creditLabel);
    const plantSource = cellText(cell(row, header, "Plant"));
    const plant = plantSource ? canonicalPlant(plantSource) : null;
    const reportingMonth = `${postingDate.slice(0, 7)}-01`;
    const key = `${plant ?? ""}\u0000${reportingMonth}`;
    const group = byPlantMonth.get(key) ?? { plant, reportingMonth, rowCount: 0, actual: 0n };
    group.rowCount += 1;
    group.actual += rowDebit - rowCredit;
    byPlantMonth.set(key, group);
    if (legacyCompatible(row, header)) {
      const legacyKey = `${plant!}\u0000${reportingMonth}`;
      const legacyGroup = legacyByPlantMonth.get(legacyKey) ?? {
        plant: plant!,
        reportingMonth,
        rowCount: 0,
        actual: 0n,
      };
      legacyGroup.rowCount += 1;
      legacyGroup.actual += rowDebit - rowCredit;
      legacyByPlantMonth.set(legacyKey, legacyGroup);
      legacyRowCount += 1;
    }
    debit += rowDebit;
    credit += rowCredit;
    rowCount += 1;
    rows.push({
      sourceRow: rowNumber,
      sourceCells: Object.fromEntries(
        header.columns.map(({ name, column }) => [name, nullable(cellText(row.getCell(column)))]),
      ),
      transactionNumber: nullable(optionalCellText(row, header, "Transaction Number")),
      lineId: nullable(optionalCellText(row, header, "Line_Id") || optionalCellText(row, header, "#")),
      postingDate,
      plant: nullable(plantSource),
      costCenter: nullable(optionalCellText(row, header, "Cost Center")),
      glCode: nullable(optionalCellText(row, header, "MIS GL Code")),
      debit: nullable(debitText),
      credit: nullable(creditText),
      section: nullable(optionalCellText(row, header, "Section")),
      origin: nullable(optionalCellText(row, header, "Origin")),
      comments: nullable(optionalCellText(row, header, "Comments")),
      comments2: nullable(optionalCellText(row, header, "Comments_2")),
    });
  });
  const groups = [...byPlantMonth.values()].sort((left, right) =>
    `${left.plant ?? ""}\u0000${left.reportingMonth}`.localeCompare(
      `${right.plant ?? ""}\u0000${right.reportingMonth}`,
    ),
  );
  return {
    columns: header.columns.map(({ name }) => name),
    rows,
    rowCount,
    debit: formatMoney(debit),
    credit: formatMoney(credit),
    actual: formatMoney(debit - credit),
    reportingMonths: [...new Set(groups.map(({ reportingMonth }) => reportingMonth))].sort(),
    byPlantMonth: groups.map(({ actual, ...group }) => ({ ...group, actual: formatMoney(actual) })),
    legacyCompatible: {
      rowCount: legacyRowCount,
      excludedRowCount: rowCount - legacyRowCount,
      byPlantMonth: [...legacyByPlantMonth.values()]
        .sort((left, right) =>
          `${left.plant}\u0000${left.reportingMonth}`.localeCompare(`${right.plant}\u0000${right.reportingMonth}`),
        )
        .map(({ actual, ...group }) => ({ ...group, actual: formatMoney(actual) })),
    },
  };
}

function legacyCompatible(row: Row, header: HeaderLocation): boolean {
  return (
    ["Transaction Number", "Posting Date", "Plant", "Cost Center", "MIS GL Code"].every((name) =>
      cellText(cell(row, header, name)),
    ) &&
    Boolean(optionalCellText(row, header, "AcctName") || optionalCellText(row, header, "MIS GL Name")) &&
    Boolean(optionalCellText(row, header, "Line_Id") || optionalCellText(row, header, "#"))
  );
}

function canonicalPlant(plant: string): string {
  return plant === "DUB-NUR" ? "DUB" : plant;
}

function inspectBudget(header: HeaderLocation): FinancialSourceOracle["budget"] {
  const subheader = header.worksheet.getRow(header.row + 1);
  const periods: Array<{ reportingMonth: string; budgetColumn: number; rolloverColumn: number }> = [];
  for (const { column } of header.columns) {
    const reportingMonth = monthText(header.worksheet.getRow(header.row).getCell(column));
    if (!reportingMonth || cellText(subheader.getCell(column)).toLowerCase() !== "budget") continue;
    const rolloverColumn = column + 1;
    if (cellText(subheader.getCell(rolloverColumn)).toLowerCase() !== "roll over budget") continue;
    periods.push({ reportingMonth, budgetColumn: column, rolloverColumn });
  }
  const totals = new Map(
    periods.map(({ reportingMonth }) => [reportingMonth, { leafCount: 0, budget: 0n, rollover: 0n }]),
  );
  const hierarchy: BudgetHierarchyRow[] = [];
  const ancestors: BudgetHierarchyRow[] = [];
  for (let rowNumber = header.row + 2; rowNumber <= header.worksheet.rowCount; rowNumber += 1) {
    const row = header.worksheet.getRow(rowNumber);
    if (startsNewBudgetTable(row)) break;
    if (isEmpty(row, header.columns)) continue;
    const component = cellText(cell(row, header, "Budget Components"));
    if (!component) continue;
    const outlineLevel = row.outlineLevel ?? 0;
    while (ancestors.at(-1) && ancestors.at(-1)!.outlineLevel >= outlineLevel) ancestors.pop();
    const rowPeriods: BudgetPeriodEvidence[] = [];
    for (const period of periods) {
      const budgetLabel = `Budget row ${rowNumber}`;
      const rolloverLabel = `Roll-over row ${rowNumber}`;
      const budgetText = financialText(row.getCell(period.budgetColumn), budgetLabel);
      const rolloverText = financialText(row.getCell(period.rolloverColumn), rolloverLabel);
      rowPeriods.push({
        reportingMonth: period.reportingMonth,
        budget: nullable(budgetText),
        rollover: nullable(rolloverText),
      });
    }
    const hierarchyRow: BudgetHierarchyRow = {
      sourceRow: rowNumber,
      parentSourceRow: ancestors.at(-1)?.sourceRow ?? null,
      outlineLevel,
      isLeaf: false,
      component,
      glCode: nullable(optionalCellText(row, header, "GL Codes")),
      periods: rowPeriods,
    };
    hierarchy.push(hierarchyRow);
    ancestors.push(hierarchyRow);
  }
  const parentRows = new Set(
    hierarchy.flatMap(({ parentSourceRow }) => (parentSourceRow === null ? [] : [parentSourceRow])),
  );
  for (const row of hierarchy) row.isLeaf = row.parentSourceRow !== null && !parentRows.has(row.sourceRow);
  const leaves = hierarchy
    .filter(({ isLeaf }) => isLeaf)
    .map(({ sourceRow, component, glCode, periods: leafPeriods }) => ({
      sourceRow,
      component,
      glCode,
      periods: leafPeriods,
    }));
  for (const leaf of leaves) {
    for (const period of leaf.periods) {
      const total = totals.get(period.reportingMonth)!;
      total.leafCount += 1;
      if (!period.budget && !period.rollover) continue;
      total.budget += money(period.budget || "0", `Budget row ${leaf.sourceRow}`);
      total.rollover += money(period.rollover || "0", `Roll-over row ${leaf.sourceRow}`);
    }
  }
  return {
    rowCount: leaves.length,
    hierarchy,
    leaves,
    periods: periods.map(({ reportingMonth }) => {
      const total = totals.get(reportingMonth)!;
      return {
        reportingMonth,
        leafCount: total.leafCount,
        budget: formatMoney(total.budget),
        rollover: formatMoney(total.rollover),
      };
    }),
  };
}

function startsNewBudgetTable(row: Row): boolean {
  const first = cellText(row.getCell(1));
  return /^Table-\d+/i.test(first) || /^Table-\d+/i.test(cellText(row.getCell(2))) || first === "S. No.";
}

function cell(row: Row, header: HeaderLocation, name: string): Cell {
  const column = header.columns.find((candidate) => candidate.name === name)?.column;
  if (!column) throw new Error(`Financial source is missing ${name}`);
  return row.getCell(column);
}

function optionalCellText(row: Row, header: HeaderLocation, name: string): string {
  const column = header.columns.find((candidate) => candidate.name === name)?.column;
  return column ? cellText(row.getCell(column)) : "";
}

function nullable(value: string): string | null {
  return value || null;
}

function isEmpty(row: Row, columns: HeaderLocation["columns"]): boolean {
  return columns.every(({ column }) => !cellText(row.getCell(column)));
}

function cellText(cell: Cell): string {
  const value = formulaValue(cell.value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  if (typeof value === "object" && value !== null && "richText" in value) {
    return value.richText
      .map(({ text }) => text)
      .join("")
      .trim();
  }
  return value === null || value === undefined ? "" : String(value).trim();
}

function formulaValue(value: CellValue): CellValue {
  return typeof value === "object" && value !== null && ("formula" in value || "sharedFormula" in value)
    ? (value.result ?? null)
    : value;
}

function dateText(cell: Cell): string | undefined {
  const text = cellText(cell);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return dmy ? `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}` : undefined;
}

function monthText(cell: Cell): string | undefined {
  const value = formulaValue(cell.value);
  if (value instanceof Date) return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const match = cellText(cell).match(/^([A-Za-z]{3})[- ](\d{2}|\d{4})$/);
  if (!match) return undefined;
  const month =
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
      match[1]!.toLowerCase(),
    ) + 1;
  if (!month) return undefined;
  const year = match[2]!.length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function financialText(cell: Cell, label: string): string {
  const value = formulaValue(cell.value);
  if (value instanceof Date && Number.isNaN(value.getTime())) throw new Error(`${label} is invalid`);
  return cellText(cell);
}

function money(raw: string, label: string): bigint {
  const text = raw.replaceAll(",", "");
  const match = text.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) throw new Error(`${label} is not a decimal amount`);
  const fraction = match[3] ?? "";
  let paise = BigInt(match[2]!) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, "0"));
  if (fraction[2] && Number(fraction[2]) >= 5) paise += 1n;
  return match[1] === "-" ? -paise : paise;
}

function formatMoney(paise: bigint): string {
  const sign = paise < 0 ? "-" : "";
  const absolute = paise < 0 ? -paise : paise;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}
