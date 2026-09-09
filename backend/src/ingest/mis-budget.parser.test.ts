import assert from "node:assert/strict";
import test from "node:test";
import { Workbook, type CellValue, type Worksheet } from "exceljs";
import { z } from "zod";
import { parseMisBudgetWorkbook } from "./mis-budget.parser";
import { WorkbookRowLimitError } from "./workbook-guard";

test("the MIS budget parser identifies Table-2 by its required header set, extracts the Budget and Roll Over Budget columns of every first-of-month date block present for GL line rows, skips component group rows and the YTD and FY blocks, accepts a formula cell's cached numeric result and rejects one with no cache, stores amounts as paise and every field as provided, and rejects duplicate grain, a GL row missing its S.No or component, and a workbook with no GL rows before any write", async () => {
  const parsed = await parseMisBudgetWorkbook(
    await workbookBuffer((sheet) => {
      addBudgetTable(sheet);
      addGlRow(sheet, 6, {
        lineId: "1.1",
        component: "Imported Sprouts",
        glCode: "50001201",
        aprilBudget: 10.105,
        aprilRollover: { formula: "A1", result: 2 },
        mayBudget: "1,234.50",
        mayRollover: null,
      });
      addGlRow(sheet, 7, {
        lineId: "1.2",
        component: "Land Levelling",
        glCode: "50001202",
        aprilBudget: -1,
        aprilRollover: { formula: "A1", result: 0.125 },
        mayBudget: 1.005,
        mayRollover: { formula: "A1", result: -0.125 },
      });
    }),
  );

  assert.equal(parsed.formatId, "nursery-mis-financial-v1");
  assert.equal(parsed.plant, "DUB");
  assert.equal(parsed.totalRowCount, 4);
  assert.deepEqual(
    parsed.periods.map(({ period, rows }) => ({ period, rows })),
    [
      {
        period: "2026-04-01",
        rows: [
          {
            formatId: "nursery-mis-financial-v1",
            period: "2026-04-01",
            lineId: "1.1",
            glCode: "50001201",
            costCenter: "Imported Sprouts",
            budgetAmount: "10.11",
            rolloverAmount: "2.00",
          },
          {
            formatId: "nursery-mis-financial-v1",
            period: "2026-04-01",
            lineId: "1.2",
            glCode: "50001202",
            costCenter: "Land Levelling",
            budgetAmount: "-1.00",
            rolloverAmount: "0.13",
          },
        ],
      },
      {
        period: "2026-05-01",
        rows: [
          {
            formatId: "nursery-mis-financial-v1",
            period: "2026-05-01",
            lineId: "1.1",
            glCode: "50001201",
            costCenter: "Imported Sprouts",
            budgetAmount: "1234.50",
            rolloverAmount: "0.00",
          },
          {
            formatId: "nursery-mis-financial-v1",
            period: "2026-05-01",
            lineId: "1.2",
            glCode: "50001202",
            costCenter: "Land Levelling",
            budgetAmount: "1.01",
            rolloverAmount: "-0.13",
          },
        ],
      },
    ],
  );

  await rejectsWithPaths(
    workbookBuffer((sheet) => {
      addBudgetTable(sheet);
      const duplicate = {
        lineId: "1.1",
        component: "Imported Sprouts",
        glCode: "50001201",
        aprilBudget: 1,
        aprilRollover: 0,
        mayBudget: 1,
        mayRollover: 0,
      };
      addGlRow(sheet, 6, duplicate);
      addGlRow(sheet, 7, duplicate);
    }),
    ["rows.7.grain", "rows.7.grain"],
  );

  await rejectsWithPaths(
    workbookBuffer((sheet) => {
      addBudgetTable(sheet);
      addGlRow(sheet, 6, {
        lineId: "",
        component: "",
        glCode: "50001201",
        aprilBudget: "1,00",
        aprilRollover: { formula: "A1" },
        mayBudget: 1,
        mayRollover: 0,
      });
    }),
    ["rows.6.lineId", "rows.6.costCenter", "rows.6.budgetAmount", "rows.6.rolloverAmount"],
  );

  await rejectsWithPaths(
    workbookBuffer((sheet) => {
      addBudgetTable(sheet);
    }),
    ["rows"],
  );

  await rejectsWithPaths(
    workbookBuffer((sheet) => {
      addBudgetTable(sheet);
      sheet.getCell(3, 15).value = new Date("2026-05-15T00:00:00Z");
      addGlRow(sheet, 6, {
        lineId: "1.1",
        component: "Imported Sprouts",
        glCode: "50001201",
        aprilBudget: 1,
        aprilRollover: 0,
        mayBudget: 1,
        mayRollover: 0,
      });
    }),
    ["file.headers.2026-05-15"],
  );

  await assert.rejects(
    parseMisBudgetWorkbook(
      await workbookBuffer((sheet) => {
        addBudgetTable(sheet);
        addGlRow(sheet, 6, {
          lineId: "1.1",
          component: "Imported Sprouts",
          glCode: "50001201",
          aprilBudget: 1,
          aprilRollover: 0,
          mayBudget: 1,
          mayRollover: 0,
        });
      }),
      1,
    ),
    (error: unknown) => error instanceof WorkbookRowLimitError && error.limit === 1,
  );
});

async function rejectsWithPaths(buffer: Promise<Buffer>, expectedPaths: string[]): Promise<void> {
  await assert.rejects(parseMisBudgetWorkbook(await buffer), (error: unknown) => {
    assert.ok(error instanceof z.ZodError);
    assert.deepEqual(
      error.issues.map(({ path }) => path.join(".")),
      expectedPaths,
    );
    return true;
  });
}

async function workbookBuffer(build: (sheet: Worksheet) => void): Promise<Buffer> {
  const workbook = new Workbook();
  const decoy = workbook.addWorksheet("MIs Format");
  decoy.addRow(["not", "the", "table"]);
  const sheet = workbook.addWorksheet("Arbitrary name");
  build(sheet);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function addBudgetTable(sheet: Worksheet): void {
  sheet.getCell(3, 1).value = " S.  No. ";
  sheet.getCell(3, 2).value = "Budget\nComponents";
  sheet.getCell(3, 3).value = "Rollover (Y/N)";
  sheet.getCell(3, 4).value = "Payment Office";
  sheet.getCell(3, 6).value = "GL Codes";
  addBlock(sheet, 7, "YTD 22-23");
  addBlock(sheet, 11, new Date("2026-04-01T00:00:00Z"));
  addBlock(sheet, 15, new Date("2026-05-01T00:00:00Z"));
  addBlock(sheet, 19, "FY 26-27");
  sheet.getCell(5, 1).value = "1";
  sheet.getCell(5, 2).value = "Component group";
  sheet.getCell(5, 11).value = "not parsed";
}

function addBlock(sheet: Worksheet, column: number, header: CellValue): void {
  sheet.mergeCells(3, column, 3, column + 3);
  sheet.getCell(3, column).value = header;
  ["Budget", "Roll   Over\nBudget", "Actual", "%"].forEach((name, offset) => {
    sheet.getCell(4, column + offset).value = name;
  });
}

function addGlRow(
  sheet: Worksheet,
  row: number,
  values: {
    lineId: string;
    component: string;
    glCode: string;
    aprilBudget: CellValue;
    aprilRollover: CellValue;
    mayBudget: CellValue;
    mayRollover: CellValue;
  },
): void {
  sheet.getCell(row, 1).value = values.lineId;
  sheet.getCell(row, 2).value = values.component;
  sheet.getCell(row, 6).value = values.glCode;
  sheet.getCell(row, 7).value = 99_999;
  sheet.getCell(row, 11).value = values.aprilBudget;
  sheet.getCell(row, 12).value = values.aprilRollover;
  sheet.getCell(row, 13).value = 88_888;
  sheet.getCell(row, 14).value = "derived";
  sheet.getCell(row, 15).value = values.mayBudget;
  sheet.getCell(row, 16).value = values.mayRollover;
  sheet.getCell(row, 17).value = 77_777;
  sheet.getCell(row, 18).value = "derived";
  sheet.getCell(row, 19).value = 66_666;
}
