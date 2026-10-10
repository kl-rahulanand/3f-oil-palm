import type { Cell, CellValue, Row, Worksheet } from "exceljs";
import { z } from "zod";
import {
  addDecimal,
  cellSourceValue,
  cellText,
  financialIssue,
  financialValidationError,
  formulaCacheIssue,
  formatDecimal,
  parseFinancialMoney,
  readFinancialWorkbook,
  type ExactDecimal,
  type MoneyEvidence,
  type ParsedMoney,
  type SourceRow,
} from "./financial-workbook.parser";

const REQUIRED_HEADERS = ["S. No.", "Budget Components", "Rollover (Y/N)", "Payment Office", "GL Codes"] as const;
const MONTH_HEADERS = ["Budget", "Roll Over Budget", "Actual", "%"] as const;
export const FINANCIAL_BUDGET_OWNER = "DUB";

interface LocatedBudgetTable {
  worksheet: Worksheet;
  headerRowNumber: number;
  columns: ReadonlyMap<string, number>;
}

interface MonthColumns {
  reportingMonth: string;
  budget: number;
  rollover: number;
  all: readonly number[];
}

interface CandidateRow {
  row: Row;
  sNo: string | null;
  componentName: string;
  depth: number;
  glCode: string | null;
  paymentOffice: string | null;
  sourceRow: SourceRow;
}

export interface FinancialBudgetComponent {
  componentKey: string;
  parentComponentKey: string | null;
  sNo: string | null;
  componentName: string;
  depth: number;
  sortOrder: number;
  isLeaf: boolean;
  sourceRowNumber: number;
  sourceRow: SourceRow;
}

export interface FinancialBudgetRow {
  componentKey: string;
  reportingMonth: string;
  glCode: string | null;
  paymentOffice: string | null;
  rolloverEnabled: boolean;
  budgetAmount: string;
  rolloverAmount: string;
  sourceRowNumber: number;
  sourceRow: SourceRow;
  moneyEvidence: { budget: MoneyEvidence; rollover: MoneyEvidence };
}

export interface ParsedFinancialBudget {
  budgetOwnerPlantCode: string;
  components: FinancialBudgetComponent[];
  budgetRows: FinancialBudgetRow[];
  validation: {
    componentCount: number;
    leafCount: number;
    monthCount: number;
    budgetRowCount: number;
    sourceReportingMonths: string[];
    roundingDelta: { budget: string; rollover: string };
  };
}

export async function parseFinancialBudgetWorkbook(
  buffer: Buffer,
  declaredBudgetOwner: string,
): Promise<ParsedFinancialBudget> {
  const workbook = await readFinancialWorkbook(buffer);
  const table = findBudgetTable(workbook.worksheets);
  if (!table) {
    throw financialValidationError([financialIssue(["file", "headers"], "Required Budget headers were not found")]);
  }

  const issues: z.ZodIssue[] = [];
  if (declaredBudgetOwner !== FINANCIAL_BUDGET_OWNER) {
    issues.push(financialIssue(["file", "budgetOwner"], "Budget owner must be DUB"));
  }
  const months = findMonthColumns(table, issues);
  if (!months.length) issues.push(financialIssue(["file", "headers"], "No monthly Budget blocks were found"));

  const candidates = budgetCandidates(table, months, issues);
  if (issues.length) throw financialValidationError(issues);
  const components: FinancialBudgetComponent[] = [];
  const budgetRows: FinancialBudgetRow[] = [];
  const componentKeys = new Set<string>();
  const parents: Array<FinancialBudgetComponent | undefined> = [];
  const paymentOffices: Array<string | null | undefined> = [];
  let budgetDelta = zeroDecimal();
  let rolloverDelta = zeroDecimal();

  candidates.forEach((candidate, index) => {
    const parent = candidate.depth === 0 ? undefined : parents[candidate.depth - 1];
    if (candidate.depth > 0 && !parent) {
      issues.push(financialIssue(["rows", candidate.row.number, "outline"], "Budget component has no parent"));
      return;
    }
    const hasChild = candidates[index + 1]?.depth > candidate.depth;
    const hasBudgetFormula = months.some(({ budget }) => isFormula(candidate.row.getCell(budget).value));
    const isLeaf = !hasChild && !hasBudgetFormula;
    const identitySNo = candidate.sNo ?? parent?.sNo ?? "no-serial";
    const segment = isLeaf
      ? `${identitySNo}|${candidate.glCode ?? "no-gl"}|${slug(candidate.componentName)}`
      : `${candidate.sNo ?? "no-serial"}|${slug(candidate.componentName)}`;
    const componentKey = parent ? `${parent.componentKey}/${segment}` : segment;
    if (componentKeys.has(componentKey)) {
      issues.push(financialIssue(["rows", candidate.row.number, "componentKey"], "Component identity is duplicated"));
      return;
    }
    componentKeys.add(componentKey);

    const component: FinancialBudgetComponent = {
      componentKey,
      parentComponentKey: parent?.componentKey ?? null,
      sNo: candidate.sNo,
      componentName: candidate.componentName,
      depth: candidate.depth,
      sortOrder: components.length,
      isLeaf,
      sourceRowNumber: candidate.row.number,
      sourceRow: candidate.sourceRow,
    };
    components.push(component);
    parents[candidate.depth] = component;
    parents.length = candidate.depth + 1;
    const paymentOffice =
      candidate.paymentOffice ?? (candidate.depth ? paymentOffices[candidate.depth - 1] : null) ?? null;
    paymentOffices[candidate.depth] = paymentOffice;
    paymentOffices.length = candidate.depth + 1;
    if (!isLeaf) return;

    const rolloverEnabled = parseRolloverFlag(
      candidate.row.getCell(requiredColumn(table, "Rollover (Y/N)")),
      candidate.row.number,
      issues,
    );
    if (rolloverEnabled === undefined) return;

    for (const month of months) {
      const rowIssues: z.ZodIssue[] = [];
      const budget = parseRequiredMoney(
        candidate.row.getCell(month.budget),
        ["rows", candidate.row.number, month.reportingMonth, "Budget"],
        rowIssues,
      );
      const rollover = parseRequiredMoney(
        candidate.row.getCell(month.rollover),
        ["rows", candidate.row.number, month.reportingMonth, "Roll Over Budget"],
        rowIssues,
      );
      issues.push(...rowIssues);
      if (!budget || !rollover || rowIssues.length) continue;
      budgetDelta = addDecimal(budgetDelta, budget.delta);
      rolloverDelta = addDecimal(rolloverDelta, rollover.delta);
      budgetRows.push({
        componentKey,
        reportingMonth: month.reportingMonth,
        glCode: candidate.glCode,
        paymentOffice,
        rolloverEnabled,
        budgetAmount: budget.evidence.rounded,
        rolloverAmount: rollover.evidence.rounded,
        sourceRowNumber: candidate.row.number,
        sourceRow: candidate.sourceRow,
        moneyEvidence: { budget: budget.evidence, rollover: rollover.evidence },
      });
    }
  });

  if (!components.length && !issues.length)
    issues.push(financialIssue(["rows"], "Workbook contains no Budget components"));
  if (!components.some(({ isLeaf }) => isLeaf) && !issues.length) {
    issues.push(financialIssue(["rows"], "Workbook contains no Budget leaves"));
  }
  if (issues.length) throw financialValidationError(issues);

  return {
    budgetOwnerPlantCode: FINANCIAL_BUDGET_OWNER,
    components,
    budgetRows,
    validation: {
      componentCount: components.length,
      leafCount: components.filter(({ isLeaf }) => isLeaf).length,
      monthCount: months.length,
      budgetRowCount: budgetRows.length,
      sourceReportingMonths: months.map(({ reportingMonth }) => reportingMonth),
      roundingDelta: { budget: formatDecimal(budgetDelta), rollover: formatDecimal(rolloverDelta) },
    },
  };
}

function findBudgetTable(worksheets: Worksheet[]): LocatedBudgetTable | undefined {
  for (const worksheet of worksheets) {
    let found: LocatedBudgetTable | undefined;
    worksheet.eachRow((row, rowNumber) => {
      if (found) return;
      const columns = new Map<string, number>();
      row.eachCell((cell, columnNumber) => {
        const header = normalizeHeader(cellText(cell));
        if (header && !columns.has(header)) columns.set(header, columnNumber);
      });
      if (REQUIRED_HEADERS.every((header) => columns.has(header))) {
        found = { worksheet, headerRowNumber: rowNumber, columns };
      }
    });
    if (found) return found;
  }
  return undefined;
}

function findMonthColumns(table: LocatedBudgetTable, issues: z.ZodIssue[]): MonthColumns[] {
  const header = table.worksheet.getRow(table.headerRowNumber);
  const subheader = table.worksheet.getRow(table.headerRowNumber + 1);
  const months: MonthColumns[] = [];
  header.eachCell((cell, columnNumber) => {
    if (cell.isMerged && cell.master.address !== cell.address) return;
    const reportingMonth = monthHeader(cell);
    if (!reportingMonth) return;
    const names = MONTH_HEADERS.map((_, offset) => normalizeHeader(cellText(subheader.getCell(columnNumber + offset))));
    if (!MONTH_HEADERS.every((name, index) => name === names[index])) {
      issues.push(financialIssue(["file", "headers", reportingMonth], "Monthly Budget block headers are invalid"));
      return;
    }
    months.push({
      reportingMonth,
      budget: columnNumber,
      rollover: columnNumber + 1,
      all: MONTH_HEADERS.map((_, offset) => columnNumber + offset),
    });
  });
  return months.sort((left, right) => left.reportingMonth.localeCompare(right.reportingMonth));
}

function budgetCandidates(table: LocatedBudgetTable, months: MonthColumns[], issues: z.ZodIssue[]): CandidateRow[] {
  const candidates: CandidateRow[] = [];
  for (let rowNumber = table.headerRowNumber + 2; rowNumber <= table.worksheet.rowCount; rowNumber += 1) {
    const row = table.worksheet.getRow(rowNumber);
    if (startsAnotherTable(row)) break;
    const nameCell = row.getCell(requiredColumn(table, "Budget Components"));
    const componentName = cellText(nameCell).trim();
    const hasFinancialValue = months.some(({ all }) =>
      all.some((columnNumber) => cellSourceValue(row.getCell(columnNumber)) !== null),
    );
    const glCode = textOrNull(row.getCell(requiredColumn(table, "GL Codes")));
    let formulaSubtotal = false;
    for (const month of months) {
      for (const [name, columnNumber] of [
        ["Budget", month.budget],
        ["Roll Over Budget", month.rollover],
      ] as const) {
        formulaSubtotal ||= isFormula(row.getCell(columnNumber).value);
        const message = formulaCacheIssue(row.getCell(columnNumber));
        if (message) issues.push(financialIssue(["rows", row.number, month.reportingMonth, name], message));
      }
    }
    if (!componentName) {
      if (!glCode && formulaSubtotal) break;
      if (glCode || hasFinancialValue) {
        issues.push(financialIssue(["rows", row.number, "componentName"], "Budget Components is required"));
      }
      continue;
    }
    candidates.push({
      row,
      sNo: textOrNull(row.getCell(requiredColumn(table, "S. No."))),
      componentName,
      depth: nameCell.alignment?.indent ?? 0,
      glCode,
      paymentOffice: textOrNull(row.getCell(requiredColumn(table, "Payment Office"))),
      sourceRow: sourceRow(row, table, months),
    });
  }
  return candidates;
}

function sourceRow(row: Row, table: LocatedBudgetTable, months: MonthColumns[]): SourceRow {
  const entries: Array<readonly [string, string | null]> = REQUIRED_HEADERS.map((header) => [
    header,
    cellSourceValue(row.getCell(requiredColumn(table, header))),
  ]);
  for (const month of months) {
    MONTH_HEADERS.forEach((header, index) => {
      entries.push([`${month.reportingMonth} ${header}`, cellSourceValue(row.getCell(month.all[index]!))]);
    });
  }
  return Object.fromEntries(entries);
}

function parseRolloverFlag(cell: Cell, rowNumber: number, issues: z.ZodIssue[]): boolean | undefined {
  const value = cellText(cell).trim().toUpperCase();
  if (value === "Y") return true;
  if (value === "N" || value === "") return false;
  issues.push(financialIssue(["rows", rowNumber, "Rollover (Y/N)"], "Rollover flag must be Y or N"));
  return undefined;
}

function parseRequiredMoney(cell: Cell, path: Array<string | number>, issues: z.ZodIssue[]): ParsedMoney | undefined {
  const issueCount = issues.length;
  const money = parseFinancialMoney(cell, path, issues, false);
  if (!money && issues.length === issueCount) {
    const label = String(path.at(-1));
    issues.push(financialIssue(path, `${label} is required; use numeric zero for a loaded zero`));
  }
  return money;
}

function monthHeader(cell: Cell): string | undefined {
  const value = cell.value;
  if (value instanceof Date && Number.isFinite(value.getTime()) && value.getUTCDate() === 1) {
    return `${value.getUTCFullYear().toString().padStart(4, "0")}-${(value.getUTCMonth() + 1)
      .toString()
      .padStart(2, "0")}-01`;
  }
  const text = cellText(cell);
  const match = text.match(/^(\d{4})-(\d{2})-01(?:T.*)?$/);
  if (!match) return undefined;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${match[1]}-${match[2]}-01` : undefined;
}

function normalizeHeader(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function requiredColumn(table: LocatedBudgetTable, header: (typeof REQUIRED_HEADERS)[number]): number {
  return table.columns.get(header)!;
}

function startsAnotherTable(row: Row): boolean {
  return /^Table-\d+$/i.test(cellText(row.getCell(1)).trim());
}

function textOrNull(cell: Cell): string | null {
  return cellText(cell).trim() || null;
}

function isFormula(value: CellValue): boolean {
  return typeof value === "object" && value !== null && ("formula" in value || "sharedFormula" in value);
}

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function zeroDecimal(): ExactDecimal {
  return { coefficient: 0n, scale: 2 };
}
