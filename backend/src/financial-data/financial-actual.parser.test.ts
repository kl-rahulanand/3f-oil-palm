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

test("the independent Actual parser preserves source whitespace while normalizing governed fields", async () => {
  const parsed = await parseFinancialActualsWorkbook(
    await workbookBuffer([
      actualRow({
        transactionNumber: "  TX-SPACE  ",
        lineId: "  LINE-SPACE  ",
        plant: "  DUB-NUR  ",
        comment1: "  first comment  ",
      }),
    ]),
  );

  assert.deepEqual(
    {
      transactionNumber: parsed.lines[0]?.transactionNumber,
      lineId: parsed.lines[0]?.lineId,
      sourcePlantCode: parsed.lines[0]?.sourcePlantCode,
      comment1: parsed.lines[0]?.comment1,
    },
    {
      transactionNumber: "TX-SPACE",
      lineId: "LINE-SPACE",
      sourcePlantCode: "DUB-NUR",
      comment1: "first comment",
    },
  );
  assert.deepEqual(
    {
      transactionNumber: parsed.lines[0]?.sourceRow["Transaction Number"],
      lineId: parsed.lines[0]?.sourceRow.Line_Id,
      plant: parsed.lines[0]?.sourceRow.Plant,
      comment1: parsed.lines[0]?.sourceRow.Comments,
    },
    {
      transactionNumber: "  TX-SPACE  ",
      lineId: "  LINE-SPACE  ",
      plant: "  DUB-NUR  ",
      comment1: "  first comment  ",
    },
  );
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

test("the independent Actual parser uses cached ordinary formula results for governed fields and raw evidence", async () => {
  const parsed = await parseFinancialActualsWorkbook(
    await workbookBuffer([
      actualRow({
        date: { formula: "DATE(2026,4,30)", result: new Date("2026-04-30T00:00:00.000Z") },
        plant: { formula: '"  DUB-NUR  "', result: "  DUB-NUR  " },
        debit: { formula: "2.005", result: 2.005 },
        credit: { formula: "1", result: 1 },
        net: { formula: "1.005", result: 1.005 },
        comment1: { formula: '"  cached comment  "', result: "  cached comment  " },
      }),
    ]),
  );

  assert.deepEqual(
    {
      postingDate: parsed.lines[0]?.postingDate,
      debit: parsed.lines[0]?.debit,
      credit: parsed.lines[0]?.credit,
      actualAmount: parsed.lines[0]?.actualAmount,
      sourcePlantCode: parsed.lines[0]?.sourcePlantCode,
      comment1: parsed.lines[0]?.comment1,
      sourceRow: {
        date: parsed.lines[0]?.sourceRow["Posting Date"],
        plant: parsed.lines[0]?.sourceRow.Plant,
        debit: parsed.lines[0]?.sourceRow.Debit,
        comment1: parsed.lines[0]?.sourceRow.Comments,
      },
    },
    {
      postingDate: "2026-04-30",
      debit: "2.01",
      credit: "1.00",
      actualAmount: "1.01",
      sourcePlantCode: "DUB-NUR",
      comment1: "cached comment",
      sourceRow: {
        date: "2026-04-30",
        plant: "  DUB-NUR  ",
        debit: "2.005",
        comment1: "  cached comment  ",
      },
    },
  );
});

test("the independent Actual parser uses cached shared formula results for governed fields and raw evidence", async () => {
  const parsed = await parseFinancialActualsWorkbook(
    await workbookBuffer([
      actualRow({
        date: { sharedFormula: "D2", result: new Date("2026-04-30T00:00:00.000Z") },
        plant: { sharedFormula: "G2", result: "  DUB-NUR  " },
        debit: { sharedFormula: "L2", result: 2.005 },
        credit: { sharedFormula: "M2", result: 1 },
        net: { sharedFormula: "N2", result: 1.005 },
        comment1: { sharedFormula: "R2", result: "  shared comment  " },
      }),
    ]),
  );

  assert.deepEqual(
    {
      postingDate: parsed.lines[0]?.postingDate,
      debit: parsed.lines[0]?.debit,
      credit: parsed.lines[0]?.credit,
      actualAmount: parsed.lines[0]?.actualAmount,
      sourcePlantCode: parsed.lines[0]?.sourcePlantCode,
      comment1: parsed.lines[0]?.comment1,
      sourceRow: {
        date: parsed.lines[0]?.sourceRow["Posting Date"],
        plant: parsed.lines[0]?.sourceRow.Plant,
        debit: parsed.lines[0]?.sourceRow.Debit,
        comment1: parsed.lines[0]?.sourceRow.Comments,
      },
    },
    {
      postingDate: "2026-04-30",
      debit: "2.01",
      credit: "1.00",
      actualAmount: "1.01",
      sourcePlantCode: "DUB-NUR",
      comment1: "shared comment",
      sourceRow: {
        date: "2026-04-30",
        plant: "  DUB-NUR  ",
        debit: "2.005",
        comment1: "  shared comment  ",
      },
    },
  );
});

test("the independent Actual parser keeps cached blank ordinary and shared formula dimensions null", async () => {
  const parsed = await parseFinancialActualsWorkbook(
    await workbookBuffer([
      actualRow({
        transactionNumber: "TX-BLANK-ORDINARY",
        lineId: "BLANK-ORDINARY",
        plant: { formula: '"   "', result: "   " },
        costCenter: { formula: '"\t"', result: "\t" },
      }),
      actualRow({
        transactionNumber: "TX-BLANK-SHARED",
        lineId: "BLANK-SHARED",
        plant: { sharedFormula: "G2", result: "   " },
        costCenter: { sharedFormula: "H2", result: "\t" },
      }),
    ]),
  );

  assert.deepEqual(
    parsed.lines.map(({ sourcePlantCode, sourceCostCenterCode, sourceRow }) => ({
      sourcePlantCode,
      sourceCostCenterCode,
      rawPlant: sourceRow.Plant,
      rawCostCenter: sourceRow["Cost Center"],
    })),
    [
      { sourcePlantCode: null, sourceCostCenterCode: null, rawPlant: "   ", rawCostCenter: "\t" },
      { sourcePlantCode: null, sourceCostCenterCode: null, rawPlant: "   ", rawCostCenter: "\t" },
    ],
  );
});

test("the independent Actual parser rejects uncached ordinary formulas before parsing or skipping any source row", async () => {
  await assert.rejects(
    parseFinancialActualsWorkbook(
      await workbookBuffer([
        actualRow({ date: { formula: "DATE(2026,4,30)" } }),
        actualRow({
          transactionNumber: "TX-2",
          lineId: "2",
          comment1: { formula: '"optional"' },
        }),
        formulaOnlyRow(12, { formula: "1.005" }),
      ]),
    ),
    (error: unknown) => {
      assert.ok(error instanceof z.ZodError);
      assert.deepEqual(
        error.issues.map(({ path, message }) => ({ path, message })),
        [
          {
            path: ["rows", 4, "Posting Date"],
            message: "Formula has no cached result; recalculate and save the workbook",
          },
          {
            path: ["rows", 5, "Comments"],
            message: "Formula has no cached result; recalculate and save the workbook",
          },
          {
            path: ["rows", 6, "Debit"],
            message: "Formula has no cached result; recalculate and save the workbook",
          },
        ],
      );
      return true;
    },
  );
});

test("the independent Actual parser rejects uncached shared formulas before parsing or skipping any source row", async () => {
  await assert.rejects(
    parseFinancialActualsWorkbook(
      await workbookBuffer([
        actualRow({ date: { sharedFormula: "D2" } }),
        actualRow({
          transactionNumber: "TX-2",
          lineId: "2",
          plant: { sharedFormula: "G2" },
        }),
        formulaOnlyRow(12, { sharedFormula: "L2" }),
      ]),
    ),
    (error: unknown) => {
      assert.ok(error instanceof z.ZodError);
      assert.deepEqual(
        error.issues.map(({ path, message }) => ({ path, message })),
        [
          {
            path: ["rows", 4, "Posting Date"],
            message: "Formula has no cached result; recalculate and save the workbook",
          },
          {
            path: ["rows", 5, "Plant"],
            message: "Formula has no cached result; recalculate and save the workbook",
          },
          {
            path: ["rows", 6, "Debit"],
            message: "Formula has no cached result; recalculate and save the workbook",
          },
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
  rows.flat().forEach((value) => {
    if (typeof value === "object" && value !== null && "sharedFormula" in value) {
      worksheet.getCell(value.sharedFormula).value = { formula: "0", result: value.result ?? 1 };
    }
  });
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
  date?: CellValue;
  month?: string | null;
  section?: string | null;
  plant?: CellValue;
  costCenter?: CellValue;
  consideration?: string | null;
  glCode?: string | null;
  glName?: string | null;
  debit?: CellValue;
  credit?: CellValue;
  net?: CellValue;
  comment1?: CellValue;
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

function formulaOnlyRow(column: number, value: CellValue): CellValue[] {
  const row = Array<CellValue>(HEADERS.length).fill(null);
  row[column - 1] = value;
  return row;
}
