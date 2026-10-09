import type { Row } from "exceljs";
import { z } from "zod";
import {
  addDecimal,
  cellText,
  column,
  financialIssue,
  financialValidationError,
  findFinancialTable,
  formatDecimal,
  formatPaise,
  hasUncachedFormula,
  parseFinancialDate,
  parseFinancialMoney,
  rawColumn,
  readFinancialWorkbook,
  readSourceRow,
  type ExactDecimal,
  type MoneyEvidence,
  type SourceRow,
} from "./financial-workbook.parser";

const REQUIRED_HEADERS = [
  "#",
  "Transaction Number",
  "Line_Id",
  "Posting Date",
  "Month",
  "Section",
  "Plant",
  "Cost Center",
  "Considaration",
  "MIS GL Code",
  "MIS GL Name",
  "Debit",
  "Credit",
  "net",
  "ShortName",
  "ContraAct",
  "LineMemo",
  "Comments",
  "Origin",
  "Reference 1",
  "Loc.",
] as const;
const MAX_MONEY_PAISE = 999_999_999_999_999_999n;

export interface FinancialActualLine {
  sourceRowNumber: number;
  sourceOrdinal: string | null;
  transactionNumber: string;
  lineId: string;
  postingDate: string;
  reportingMonth: string;
  sourceMonth: string | null;
  section: string | null;
  sourcePlantCode: string | null;
  sourceCostCenterCode: string | null;
  consideration: string | null;
  sourceGlCode: string | null;
  sourceGlName: string | null;
  debit: string;
  credit: string;
  actualAmount: string;
  sourceNet: string | null;
  shortName: string | null;
  contraAccount: string | null;
  lineMemo: string | null;
  comment1: string | null;
  comment2: string | null;
  origin: string | null;
  reference1: string | null;
  location: string | null;
  moneyEvidence: {
    debit: MoneyEvidence;
    credit: MoneyEvidence;
    sourceNet: MoneyEvidence | null;
  };
  validationEvidence: {
    monthMatchesPostingDate: boolean | null;
    netMatchesRoundedActual: boolean | null;
  };
  sourceRow: SourceRow;
}

export interface ParsedFinancialActuals {
  lines: FinancialActualLine[];
  validation: {
    rowCount: number;
    sourceReportingMonths: string[];
    monthMismatchCount: number;
    netMismatchCount: number;
    roundingDelta: { debit: string; credit: string; sourceNet: string };
  };
}

export async function parseFinancialActualsWorkbook(buffer: Buffer): Promise<ParsedFinancialActuals> {
  const workbook = await readFinancialWorkbook(buffer);
  const table = findFinancialTable(workbook.worksheets, REQUIRED_HEADERS);
  if (!table || !rawColumn(table, "Comments_2")) {
    throw financialValidationError([financialIssue(["file", "headers"], "Required Actual headers were not found")]);
  }

  const issues: z.ZodIssue[] = [];
  const lines: FinancialActualLine[] = [];
  const identities = new Set<string>();
  const months = new Set<string>();
  let debitDelta = zeroDecimal();
  let creditDelta = zeroDecimal();
  let sourceNetDelta = zeroDecimal();
  let monthMismatchCount = 0;
  let netMismatchCount = 0;

  const rows: Row[] = [];
  table.worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > table.headerRowNumber) rows.push(row);
  });

  for (const row of rows) {
    const missingFormulaIssues = table.rawColumns.flatMap(([key, columnNumber]) =>
      hasUncachedFormula(row.getCell(columnNumber))
        ? [financialIssue(["rows", row.number, key], "Formula has no cached result; recalculate and save the workbook")]
        : [],
    );
    if (missingFormulaIssues.length) {
      issues.push(...missingFormulaIssues);
      continue;
    }
    const sourceRow = readSourceRow(row, table);
    if (Object.values(sourceRow).every((value) => value === null)) continue;
    const rowIssues: z.ZodIssue[] = [];
    const value = (header: string): string | null => {
      const number = table.columns.get(header);
      return number ? sourceRowValue(row, number) : null;
    };

    const transactionNumber = value("Transaction Number") ?? "";
    if (!transactionNumber)
      rowIssues.push(financialIssue(["rows", row.number, "transactionNumber"], "Transaction Number is required"));
    const sourceOrdinal = value("#");
    const lineId = value("Line_Id") ?? sourceOrdinal ?? "";
    if (!lineId) rowIssues.push(financialIssue(["rows", row.number, "lineId"], "Line_Id or # is required"));

    const postingDate = parseFinancialDate(row.getCell(column(table, "Posting Date")));
    if (!postingDate) {
      rowIssues.push(financialIssue(["rows", row.number, "postingDate"], "Posting Date is invalid"));
    }
    const reportingMonth = postingDate ? `${postingDate.slice(0, 7)}-01` : undefined;
    const debit = parseFinancialMoney(row.getCell(column(table, "Debit")), ["rows", row.number, "debit"], rowIssues);
    const credit = parseFinancialMoney(row.getCell(column(table, "Credit")), ["rows", row.number, "credit"], rowIssues);
    const netColumn = table.columns.get("net");
    const sourceNet = netColumn
      ? parseFinancialMoney(row.getCell(netColumn), ["rows", row.number, "sourceNet"], rowIssues, false)
      : undefined;

    if (transactionNumber && lineId) {
      const identity = `${transactionNumber}\0${lineId}`;
      if (identities.has(identity)) {
        rowIssues.push(financialIssue(["rows", row.number, "lineId"], "Transaction line is duplicated"));
      } else {
        identities.add(identity);
      }
    }

    issues.push(...rowIssues);
    if (!postingDate || !reportingMonth || !debit || !credit || rowIssues.length) continue;

    const actualPaise = debit.paise - credit.paise;
    if (absolute(actualPaise) > MAX_MONEY_PAISE) {
      issues.push(financialIssue(["rows", row.number, "actualAmount"], "Debit minus Credit exceeds numeric(18,2)"));
      continue;
    }
    const sourceMonth = value("Month");
    const monthMatchesPostingDate = sourceMonth === null ? null : monthMatches(sourceMonth, postingDate);
    const netMatchesRoundedActual = sourceNet ? sourceNet.paise === actualPaise : null;
    if (monthMatchesPostingDate === false) monthMismatchCount += 1;
    if (netMatchesRoundedActual === false) netMismatchCount += 1;
    months.add(reportingMonth);
    debitDelta = addDecimal(debitDelta, debit.delta);
    creditDelta = addDecimal(creditDelta, credit.delta);
    if (sourceNet) sourceNetDelta = addDecimal(sourceNetDelta, sourceNet.delta);

    const secondCommentColumn = rawColumn(table, "Comments_2");
    lines.push({
      sourceRowNumber: row.number,
      sourceOrdinal,
      transactionNumber,
      lineId,
      postingDate,
      reportingMonth,
      sourceMonth,
      section: value("Section"),
      sourcePlantCode: value("Plant"),
      sourceCostCenterCode: value("Cost Center"),
      consideration: value("Considaration"),
      sourceGlCode: value("MIS GL Code"),
      sourceGlName: value("MIS GL Name"),
      debit: debit.evidence.rounded,
      credit: credit.evidence.rounded,
      actualAmount: formatPaise(actualPaise),
      sourceNet: sourceNet?.evidence.raw ?? null,
      shortName: value("ShortName"),
      contraAccount: value("ContraAct"),
      lineMemo: value("LineMemo"),
      comment1: value("Comments"),
      comment2: secondCommentColumn ? sourceRowValue(row, secondCommentColumn) : null,
      origin: value("Origin"),
      reference1: value("Reference 1"),
      location: value("Loc."),
      moneyEvidence: {
        debit: debit.evidence,
        credit: credit.evidence,
        sourceNet: sourceNet?.evidence ?? null,
      },
      validationEvidence: { monthMatchesPostingDate, netMatchesRoundedActual },
      sourceRow,
    });
  }

  if (!lines.length && !issues.length) issues.push(financialIssue(["rows"], "Workbook contains no Actual rows"));
  if (issues.length) throw financialValidationError(issues);

  return {
    lines,
    validation: {
      rowCount: lines.length,
      sourceReportingMonths: [...months].sort(),
      monthMismatchCount,
      netMismatchCount,
      roundingDelta: {
        debit: formatDecimal(debitDelta),
        credit: formatDecimal(creditDelta),
        sourceNet: formatDecimal(sourceNetDelta),
      },
    },
  };
}

function sourceRowValue(row: Row, columnNumber: number): string | null {
  return cellText(row.getCell(columnNumber)) || null;
}

function monthMatches(sourceMonth: string, postingDate: string): boolean {
  const expected = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  return sourceMonth.trim().slice(0, 3).toLowerCase() === expected[Number(postingDate.slice(5, 7)) - 1];
}

function zeroDecimal(): ExactDecimal {
  return { coefficient: 0n, scale: 3 };
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}
