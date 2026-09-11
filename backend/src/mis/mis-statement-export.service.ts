import { Injectable } from "@nestjs/common";
import type {
  FixedScaleMoney,
  MisStatementMeasureBlock,
  MisStatementNode,
  MisStatementResolvedResponse,
} from "@3f/contract";
import { Workbook, type Row, type Worksheet } from "exceljs";
import type { IMisStatementExportService } from "./mis-statement-export.interface";

const RUPEE_FORMAT = "₹#,##0;[Red]-₹#,##0";
const PERCENTAGE_FORMAT = "0.00%";
const MONTH_FORMATTER = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const SHORT_MONTH_FORMATTER = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" });

@Injectable()
export class MisStatementExportService implements IMisStatementExportService {
  async write(statement: MisStatementResolvedResponse): Promise<Buffer> {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet("Financial MIS");
    const blocks = statement.grandTotal.measures;

    writeHeaders(worksheet, blocks);
    let rowNumber = 3;
    const writeNode = (node: MisStatementNode, depth: number): void => {
      writeStatementRow(worksheet.getRow(rowNumber++), node, depth + 1);
      node.children.forEach((child) => writeNode(child, depth + 1));
    };
    statement.tree.forEach((node) => writeNode(node, 0));
    writeGrandTotal(worksheet, rowNumber, statement.grandTotal);

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}

function writeHeaders(worksheet: Worksheet, blocks: MisStatementMeasureBlock[]): void {
  worksheet.mergeCells(1, 1, 1, 3);
  worksheet.getCell(1, 1).value = "Financial MIS";
  ["S. No.", "Budget Component", "GL Code"].forEach((value, index) => {
    worksheet.getCell(2, index + 1).value = value;
  });

  blocks.forEach((block, index) => {
    const firstColumn = 4 + index * 4;
    worksheet.mergeCells(1, firstColumn, 1, firstColumn + 3);
    worksheet.getCell(1, firstColumn).value = formatBlockHeading(block);
    ["Budget", "Roll-over", "Actual", "%"].forEach((value, offset) => {
      worksheet.getCell(2, firstColumn + offset).value = value;
    });
  });
}

function formatBlockHeading(block: MisStatementMeasureBlock): string {
  const to = new Date(`${block.to.slice(0, 10)}T00:00:00Z`);
  if (block.from.slice(0, 7) !== block.to.slice(0, 7)) {
    const startYear = Number(block.from.slice(0, 4));
    return `FY ${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)} (YTD to ${SHORT_MONTH_FORMATTER.format(to)})`;
  }
  return MONTH_FORMATTER.format(to);
}

function writeStatementRow(row: Row, node: MisStatementNode, outlineLevel: number): void {
  row.getCell(1).value = safeWorkbookText(node.sNo);
  row.getCell(2).value = safeWorkbookText(node.budgetComponent);
  row.getCell(3).value = safeWorkbookText(node.glCode);
  writeMeasures(row, node.measures);
  row.outlineLevel = outlineLevel;
}

function writeGrandTotal(worksheet: Worksheet, rowNumber: number, grandTotal: MisStatementNode): void {
  worksheet.mergeCells(rowNumber, 1, rowNumber, 3);
  const row = worksheet.getRow(rowNumber);
  row.getCell(1).value = "Grand Total";
  writeMeasures(row, grandTotal.measures);
}

function writeMeasures(row: Row, blocks: MisStatementMeasureBlock[]): void {
  blocks.forEach((block, index) => {
    const firstColumn = 4 + index * 4;
    writeMoney(row, firstColumn, block.budget);
    row.getCell(firstColumn + 1).value = null;
    writeMoney(row, firstColumn + 2, block.actual);
    const percentageCell = row.getCell(firstColumn + 3);
    if (block.percentage === null) {
      percentageCell.value = "NA";
    } else if (isNumeric(block.percentage)) {
      percentageCell.value = Number(block.percentage);
      percentageCell.numFmt = PERCENTAGE_FORMAT;
    } else {
      percentageCell.value = block.percentage;
    }
  });
}

function writeMoney(row: Row, column: number, value: FixedScaleMoney): void {
  const cell = row.getCell(column);
  cell.value = roundedRupees(value);
  cell.numFmt = RUPEE_FORMAT;
}

function roundedRupees(value: FixedScaleMoney): number {
  const match = value.match(/^(-?)(\d+)\.(\d{2})$/);
  if (!match) throw new Error("Statement payload contains an invalid money value");
  const absolute = BigInt(match[2]) + (Number(match[3]) >= 50 ? 1n : 0n);
  const rounded = Number(match[1] ? -absolute : absolute);
  if (!Number.isSafeInteger(rounded)) throw new Error("Statement amount exceeds Excel's safe integer range");
  return rounded;
}

function isNumeric(value: string): boolean {
  return value.trim() !== "" && Number.isFinite(Number(value));
}

function safeWorkbookText(value: string | null): string | null {
  return value && /^[=+\-@]/.test(value) ? `'${value}` : value;
}
