import assert from "node:assert/strict";
import test from "node:test";
import { Workbook, type CellValue } from "exceljs";
import JSZip from "jszip";
import { z } from "zod";
import { parseSapActualsWorkbook, SapActualsArchiveLimitError, SapActualsRowLimitError } from "./sap-actuals.parser";

const HEADERS = [
  "#",
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
  "ShortName",
  "ContraAct",
  "LineMemo",
  "Comments",
  "Comments",
  "Origin",
  "Reference 1",
  "Loc.",
];

test("the SAP actuals parser identifies the sheet by its required header set, tolerates blank lead rows and the duplicate Comments column, derives a single period from Posting Date, validates every row before any write, nets Actual as Debit minus Credit at paise, uses the row number as the source identity when Line_Id is blank, and normalizes DUB-NUR to DUB keeping original and canonical keys plus the full raw row", async () => {
  const parsed = await parseSapActualsWorkbook(
    await workbookBuffer([
      sapRow({ rowNumber: 101, transactionNumber: "TXN-1", lineId: "", debit: 10.1, credit: 0.03 }),
      sapRow({
        rowNumber: 102,
        transactionNumber: "TXN-2",
        lineId: "2",
        plant: "PLANT-X",
        debit: "+1,000.00",
        credit: 1.25,
        farRight: "ignored",
      }),
    ]),
  );

  assert.equal(parsed.period, "2026-07-01");
  assert.equal(parsed.validationResult.rowCount, 2);
  assert.deepEqual(
    parsed.rows.map(({ lineId, plant, plantSrc, debit, credit, actual }) => ({
      lineId,
      plant,
      plantSrc,
      debit,
      credit,
      actual,
    })),
    [
      { lineId: "101", plant: "DUB", plantSrc: "DUB-NUR", debit: "10.10", credit: "0.03", actual: "10.07" },
      {
        lineId: "2",
        plant: "PLANT-X",
        plantSrc: "PLANT-X",
        debit: "1000.00",
        credit: "1.25",
        actual: "998.75",
      },
    ],
  );
  assert.deepEqual(
    Object.fromEntries(
      ["ShortName", "LineMemo", "Comments", "Comments_2", "Origin", "Reference 1", "Loc."].map((key) => [
        key,
        parsed.rows[0].raw[key],
      ]),
    ),
    {
      ShortName: "Short account",
      LineMemo: "Line memo",
      Comments: "First comment",
      Comments_2: "Second comment",
      Origin: "SAP",
      "Reference 1": "REF-1",
      "Loc.": "Nursery",
    },
  );
  assert.equal(parsed.rows[0].memo, "Line memo");
  assert.equal(parsed.rows[0].reference, "REF-1");
  assert.equal(Object.values(parsed.rows[1].raw).includes("ignored"), false);

  await assert.rejects(
    parseSapActualsWorkbook(
      await workbookBuffer([
        sapRow({ rowNumber: 103, transactionNumber: "TXN-3", lineId: "3", debit: "bad" }),
        sapRow({
          rowNumber: 104,
          transactionNumber: "TXN-4",
          lineId: "4",
          date: new Date("2026-08-01T00:00:00Z"),
          month: "Aug",
        }),
      ]),
    ),
    (error: unknown) => {
      assert.ok(error instanceof z.ZodError);
      assert.deepEqual(
        error.issues.map(({ path }) => path),
        [
          ["rows", 4, "debit"],
          ["rows", 5, "month"],
        ],
      );
      return true;
    },
  );

  for (const malformed of ["1,00", "1,2,3", "1.001"]) {
    await assert.rejects(
      parseSapActualsWorkbook(
        await workbookBuffer([
          sapRow({ rowNumber: 109, transactionNumber: `TXN-${malformed}`, lineId: "9", debit: malformed }),
        ]),
      ),
      (error: unknown) => error instanceof z.ZodError && error.issues[0]?.path.join(".") === "rows.4.debit",
    );
  }

  for (const malformed of ["JulXYZ", "Jul 2027"]) {
    await assert.rejects(
      parseSapActualsWorkbook(
        await workbookBuffer([
          sapRow({ rowNumber: 111, transactionNumber: `TXN-${malformed}`, lineId: "11", month: malformed }),
        ]),
      ),
      (error: unknown) => error instanceof z.ZodError && error.issues[0]?.path.join(".") === "rows.4.month",
    );
  }

  await assert.rejects(
    parseSapActualsWorkbook(
      await workbookBuffer([
        sapRow({ rowNumber: 105, transactionNumber: "TXN-5", lineId: "5" }),
        sapRow({ rowNumber: 106, transactionNumber: "TXN-6", lineId: "6" }),
      ]),
      1,
    ),
    (error: unknown) => error instanceof SapActualsRowLimitError && error.limit === 1,
  );

  const entryBomb = await JSZip.loadAsync(
    await workbookBuffer([sapRow({ rowNumber: 110, transactionNumber: "TXN-ZIP", lineId: "10" })]),
  );
  for (let index = 0; index < 257; index += 1) entryBomb.file(`extra-${index}`, "");
  await assert.rejects(
    parseSapActualsWorkbook(await entryBomb.generateAsync({ type: "nodebuffer" })),
    (error: unknown) => error instanceof SapActualsArchiveLimitError,
  );

  await assert.rejects(
    parseSapActualsWorkbook(
      await workbookBuffer(
        [sapRow({ rowNumber: 112, transactionNumber: "TXN-WIDE", lineId: "12" })],
        [...HEADERS, ...Array.from({ length: 257 - HEADERS.length }, (_, index) => `Extra ${index}`)],
      ),
    ),
    (error: unknown) => error instanceof SapActualsArchiveLimitError,
  );

  const rowBomb = new Workbook();
  const rowBombSheet = rowBomb.addWorksheet("Rows");
  rowBombSheet.getRow(3).values = HEADERS;
  for (let row = 4; row <= 260; row += 1) rowBombSheet.getRow(row).getCell(20).value = "ignored";
  await assert.rejects(
    parseSapActualsWorkbook(Buffer.from(await rowBomb.xlsx.writeBuffer()), 1),
    (error: unknown) => error instanceof SapActualsRowLimitError,
  );

  await assert.rejects(
    parseSapActualsWorkbook(
      await workbookBuffer([
        sapRow({ rowNumber: 107, transactionNumber: "TXN-DUP", lineId: "7" }),
        sapRow({ rowNumber: 108, transactionNumber: "TXN-DUP", lineId: "7" }),
      ]),
    ),
    (error: unknown) => error instanceof z.ZodError && error.issues[0]?.path.join(".") === "rows.5.lineId",
  );
});

async function workbookBuffer(rows: CellValue[][], headers: string[] = HEADERS): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.addWorksheet("Not the expected sheet name");
  const worksheet = workbook.addWorksheet("Arbitrary sheet");
  worksheet.getRow(3).values = headers;
  rows.forEach((row, index) => {
    worksheet.getRow(index + 4).values = row;
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function sapRow({
  rowNumber,
  transactionNumber,
  lineId,
  date = new Date("2026-07-15T00:00:00Z"),
  month = "Jul",
  plant = "DUB-NUR",
  debit = 100,
  credit = 25,
  farRight,
}: {
  rowNumber: number;
  transactionNumber: string;
  lineId: string;
  date?: Date;
  month?: string;
  plant?: string;
  debit?: string | number;
  credit?: string | number;
  farRight?: string;
}): CellValue[] {
  const row: CellValue[] = [
    rowNumber,
    transactionNumber,
    lineId,
    date,
    month,
    plant,
    "CC-1",
    "50001701",
    "Account name",
    debit,
    credit,
    "Short account",
    "CONTRA",
    "Line memo",
    "First comment",
    "Second comment",
    "SAP",
    "REF-1",
    "Nursery",
  ];
  if (farRight) row[16_383] = farRight;
  return row;
}
