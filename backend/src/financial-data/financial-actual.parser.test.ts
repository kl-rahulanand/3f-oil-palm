import assert from "node:assert/strict";
import test from "node:test";
import { Workbook, type CellValue } from "exceljs";
import { z } from "zod";
import { parseFinancialActualsWorkbook } from "./financial-actual.parser";

const HEADERS = [
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
  "Comments",
  "Origin",
  "Reference 1",
  "Loc.",
  "Operator Note",
] as const;

test("the independent Actual parser preserves every source column, both comments, signs and null dimensions", async () => {
  const parsed = await parseFinancialActualsWorkbook(
    await workbookBuffer([
      actualRow({
        debit: "10.125",
        credit: "-2.005",
        section: null,
        plant: null,
        costCenter: null,
        consideration: null,
        glCode: null,
        glName: null,
        comment1: "first comment",
        comment2: "second comment",
      }),
    ]),
  );

  assert.equal(parsed.lines.length, 1);
  assert.deepEqual(parsed.lines[0], {
    sourceRowNumber: 4,
    sourceOrdinal: "101",
    transactionNumber: "TX-1",
    lineId: "LINE-1",
    postingDate: "2026-04-30",
    reportingMonth: "2026-04-01",
    sourceMonth: "Apr",
    section: null,
    sourcePlantCode: null,
    sourceCostCenterCode: null,
    consideration: null,
    sourceGlCode: null,
    sourceGlName: null,
    debit: "10.13",
    credit: "-2.01",
    actualAmount: "12.14",
    sourceNet: "12.130",
    shortName: "Short name",
    contraAccount: "Contra",
    lineMemo: "Memo",
    comment1: "first comment",
    comment2: "second comment",
    origin: "SAP",
    reference1: "REF-1",
    location: "Nursery",
    moneyEvidence: {
      debit: { raw: "10.125", rounded: "10.13", roundingDelta: "0.005" },
      credit: { raw: "-2.005", rounded: "-2.01", roundingDelta: "-0.005" },
      sourceNet: { raw: "12.130", rounded: "12.13", roundingDelta: "0.000" },
    },
    validationEvidence: {
      monthMatchesPostingDate: true,
      netMatchesRoundedActual: false,
    },
    sourceRow: {
      "#": "101",
      "Transaction Number": "TX-1",
      Line_Id: "LINE-1",
      "Posting Date": "2026-04-30",
      Month: "Apr",
      Section: null,
      Plant: null,
      "Cost Center": null,
      Considaration: null,
      "MIS GL Code": null,
      "MIS GL Name": null,
      Debit: "10.125",
      Credit: "-2.005",
      net: "12.130",
      ShortName: "Short name",
      ContraAct: "Contra",
      LineMemo: "Memo",
      Comments: "first comment",
      Comments_2: "second comment",
      Origin: "SAP",
      "Reference 1": "REF-1",
      "Loc.": "Nursery",
      "Operator Note": "kept verbatim",
    },
  });
  assert.deepEqual(parsed.validation, {
    rowCount: 1,
    sourceReportingMonths: ["2026-04-01"],
    monthMismatchCount: 0,
    netMismatchCount: 1,
    roundingDelta: { debit: "0.005", credit: "-0.005", sourceNet: "0.000" },
  });
});

test("the independent Actual parser rounds positive and negative half-paise away from zero before netting", async () => {
  const parsed = await parseFinancialActualsWorkbook(
    await workbookBuffer([
      actualRow({ transactionNumber: "TX-POS", lineId: "1", debit: "1.005", credit: "0" }),
      actualRow({ transactionNumber: "TX-NEG", lineId: "2", debit: "-1.005", credit: "0" }),
    ]),
  );

  assert.deepEqual(
    parsed.lines.map(({ debit, credit, actualAmount }) => ({ debit, credit, actualAmount })),
    [
      { debit: "1.01", credit: "0.00", actualAmount: "1.01" },
      { debit: "-1.01", credit: "0.00", actualAmount: "-1.01" },
    ],
  );
});

test("the independent Actual parser derives reporting month and records source month or net mismatches", async () => {
  const parsed = await parseFinancialActualsWorkbook(
    await workbookBuffer([
      actualRow({ month: "May", net: "99.00" }),
      actualRow({ transactionNumber: "TX-2", lineId: "2", date: "2026-06-01", month: null, net: null }),
    ]),
  );

  assert.deepEqual(
    parsed.lines.map(({ reportingMonth, validationEvidence }) => ({ reportingMonth, validationEvidence })),
    [
      {
        reportingMonth: "2026-04-01",
        validationEvidence: { monthMatchesPostingDate: false, netMatchesRoundedActual: false },
      },
      {
        reportingMonth: "2026-06-01",
        validationEvidence: { monthMatchesPostingDate: null, netMatchesRoundedActual: null },
      },
    ],
  );
  assert.deepEqual(parsed.validation.sourceReportingMonths, ["2026-04-01", "2026-06-01"]);
});

test("the independent Actual parser rejects invalid dates and money without returning a partial result", async () => {
  await assert.rejects(
    parseFinancialActualsWorkbook(
      await workbookBuffer([
        actualRow({ date: "2026-02-30" }),
        actualRow({ transactionNumber: "TX-2", lineId: "2", debit: "1.2.3" }),
      ]),
    ),
    (error: unknown) => {
      assert.ok(error instanceof z.ZodError);
      assert.deepEqual(
        error.issues.map(({ path }) => path),
        [
          ["rows", 4, "postingDate"],
          ["rows", 5, "debit"],
        ],
      );
      return true;
    },
  );
});

test("the independent Actual parser rejects duplicate transaction and line identities", async () => {
  await assert.rejects(
    parseFinancialActualsWorkbook(await workbookBuffer([actualRow({}), actualRow({})])),
    (error: unknown) =>
      error instanceof z.ZodError && error.issues.length === 1 && error.issues[0]?.path.join(".") === "rows.5.lineId",
  );
});

test("the independent Actual parser requires the complete source layout including both Comments columns", async () => {
  const headers = HEADERS.filter((_, index) => index !== 18);
  const row = actualRow({}).filter((_, index) => index !== 18);

  await assert.rejects(parseFinancialActualsWorkbook(await workbookBuffer([row], headers)), (error: unknown) => {
    return error instanceof z.ZodError && error.issues[0]?.path.join(".") === "file.headers";
  });
});

test("the independent Actual parser rejects a rounded Debit-minus-Credit outside numeric(18,2)", async () => {
  await assert.rejects(
    parseFinancialActualsWorkbook(
      await workbookBuffer([actualRow({ debit: "9999999999999999.99", credit: "-9999999999999999.99", net: null })]),
    ),
    (error: unknown) =>
      error instanceof z.ZodError &&
      error.issues.length === 1 &&
      error.issues[0]?.path.join(".") === "rows.4.actualAmount",
  );
});

async function workbookBuffer(rows: CellValue[][], headers: readonly string[] = HEADERS): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.addWorksheet("Not financial data");
  const worksheet = workbook.addWorksheet("5 Months Financial Data");
  worksheet.getRow(3).values = [...headers];
  rows.forEach((row, index) => {
    worksheet.getRow(index + 4).values = row;
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function actualRow({
  transactionNumber = "TX-1",
  lineId = "LINE-1",
  date = "2026-04-30",
  month = "Apr",
  section = "Financial",
  plant = "DUB-NUR",
  costCenter = "Primary",
  consideration = "Expense",
  glCode = "50001701",
  glName = "GL name",
  debit = "10.125",
  credit = "-2.005",
  net = "12.130",
  comment1 = "first",
  comment2 = "second",
}: {
  transactionNumber?: string;
  lineId?: string;
  date?: string | Date;
  month?: string | null;
  section?: string | null;
  plant?: string | null;
  costCenter?: string | null;
  consideration?: string | null;
  glCode?: string | null;
  glName?: string | null;
  debit?: string | number;
  credit?: string | number;
  net?: string | number | null;
  comment1?: string;
  comment2?: string;
}): CellValue[] {
  return [
    101,
    transactionNumber,
    lineId,
    date,
    month,
    section,
    plant,
    costCenter,
    consideration,
    glCode,
    glName,
    debit,
    credit,
    net,
    "Short name",
    "Contra",
    "Memo",
    comment1,
    comment2,
    "SAP",
    "REF-1",
    "Nursery",
    "kept verbatim",
  ];
}
