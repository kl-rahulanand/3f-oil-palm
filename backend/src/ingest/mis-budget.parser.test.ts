import assert from "node:assert/strict";
import test from "node:test";
import { Workbook, type CellValue, type Worksheet } from "exceljs";
import { z } from "zod";
import { parseMisBudgetWorkbook } from "./mis-budget.parser";
import { WorkbookRowLimitError } from "./workbook-guard";

test("the MIS budget parser identifies Table-2 by its required header set, extracts the Budget and Roll Over Budget columns of every first-of-month date block present for GL line rows, skips component group rows and the YTD and FY blocks, accepts a formula cell's cached numeric result and rejects one with no cache, stores amounts as paise and every field as provided, and rejects a GL row missing its component and a workbook with no GL rows before any write", async () => {
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
            lineId: "6",
            leafKey: "1.1|50001201|imported-sprouts",
            glCode: "50001201",
            costCenter: "Imported Sprouts",
            budgetAmount: "10.11",
            rolloverAmount: "2.00",
          },
          {
            formatId: "nursery-mis-financial-v1",
            period: "2026-04-01",
            lineId: "7",
            leafKey: "1.2|50001202|land-levelling",
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
            lineId: "6",
            leafKey: "1.1|50001201|imported-sprouts",
            glCode: "50001201",
            costCenter: "Imported Sprouts",
            budgetAmount: "1234.50",
            rolloverAmount: "0.00",
          },
          {
            formatId: "nursery-mis-financial-v1",
            period: "2026-05-01",
            lineId: "7",
            leafKey: "1.2|50001202|land-levelling",
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
    ["rows.6.costCenter", "rows.6.budgetAmount"],
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

test("an Invalid Date elsewhere in the sheet does not prevent finding the MIS budget headers", async () => {
  const parsed = await parseMisBudgetWorkbook(
    await workbookBuffer((sheet) => {
      sheet.getCell(1, 1).value = new Date(Number.NaN);
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
  );

  assert.deepEqual(
    parsed.periods.map(({ period }) => period),
    ["2026-04-01", "2026-05-01"],
  );
  assert.equal(parsed.validationResult.headerRow, 3);
});

test("an uncomputed date-formatted formula header is not treated as a malformed monthly block", async () => {
  const parsed = await parseMisBudgetWorkbook(
    await workbookBuffer((sheet) => {
      addBudgetTable(sheet);
      sheet.getCell(3, 19).numFmt = "mmm-yy";
      sheet.getCell(3, 19).value = { formula: 'CONCATENATE("FY 26-27 (YTD Jul-26)")', result: new Date(Number.NaN) };
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
  );

  assert.deepEqual(
    parsed.periods.map(({ period }) => period),
    ["2026-04-01", "2026-05-01"],
  );
});

test("an uncached SUM parent is skipped while S.No.-less leaf GL rows are stored", async () => {
  const parsed = await parseMisBudgetWorkbook(
    await workbookBuffer((sheet) => {
      addBudgetTable(sheet);
      addGlRow(sheet, 6, {
        lineId: "1",
        component: "Insurance",
        glCode: "55011200",
        aprilBudget: { formula: "SUM(K7:K8)" },
        aprilRollover: { formula: "SUM(L7:L8)" },
        mayBudget: { formula: "SUM(O7:O8)" },
        mayRollover: { formula: "SUM(P7:P8)" },
      });
      addGlRow(sheet, 7, {
        lineId: "",
        component: "Insurance - Stocks",
        glCode: "55011201",
        aprilBudget: 10,
        aprilRollover: { formula: "A1" },
        mayBudget: 20,
        mayRollover: { formula: "A1" },
      });
      addGlRow(sheet, 8, {
        lineId: "",
        component: "Insurance - Assets",
        glCode: "55011202",
        aprilBudget: 30,
        aprilRollover: 0,
        mayBudget: 40,
        mayRollover: 0,
      });
    }),
  );

  assert.deepEqual(
    parsed.periods.map(({ period, rows }) => ({
      period,
      rows: rows.map(({ lineId, glCode, budgetAmount, rolloverAmount }) => ({
        lineId,
        glCode,
        budgetAmount,
        rolloverAmount,
      })),
    })),
    [
      {
        period: "2026-04-01",
        rows: [
          { lineId: "7", glCode: "55011201", budgetAmount: "10.00", rolloverAmount: "0.00" },
          { lineId: "8", glCode: "55011202", budgetAmount: "30.00", rolloverAmount: "0.00" },
        ],
      },
      {
        period: "2026-05-01",
        rows: [
          { lineId: "7", glCode: "55011201", budgetAmount: "20.00", rolloverAmount: "0.00" },
          { lineId: "8", glCode: "55011202", budgetAmount: "40.00", rolloverAmount: "0.00" },
        ],
      },
    ],
  );
  assert.equal(parsed.validationResult.uncomputedRolloverCount, 2);
});

test("a cached SUM parent is skipped while only its children are stored", async () => {
  const parsed = await parseMisBudgetWorkbook(
    await workbookBuffer((sheet) => {
      addBudgetTable(sheet);
      addGlRow(sheet, 6, {
        lineId: "1",
        component: "Vehicle Maintenance",
        glCode: "55010900",
        aprilBudget: { formula: "SUM(K7:K8)", result: 30 },
        aprilRollover: { formula: "SUM(L7:L8)", result: 0 },
        mayBudget: { formula: "SUM(O7:O8)", result: 70 },
        mayRollover: { formula: "SUM(P7:P8)", result: 0 },
      });
      addGlRow(sheet, 7, {
        lineId: "",
        component: "Petrol and Diesel",
        glCode: "55010901",
        aprilBudget: 10,
        aprilRollover: 0,
        mayBudget: 30,
        mayRollover: 0,
      });
      addGlRow(sheet, 8, {
        lineId: "",
        component: "Repairs and Maintenance Vehicles",
        glCode: "55010902",
        aprilBudget: 20,
        aprilRollover: 0,
        mayBudget: 40,
        mayRollover: 0,
      });
    }),
  );

  assert.deepEqual(
    parsed.periods.map(({ period, rows }) => ({
      period,
      rows: rows.map(({ glCode, budgetAmount }) => ({ glCode, budgetAmount })),
    })),
    [
      {
        period: "2026-04-01",
        rows: [
          { glCode: "55010901", budgetAmount: "10.00" },
          { glCode: "55010902", budgetAmount: "20.00" },
        ],
      },
      {
        period: "2026-05-01",
        rows: [
          { glCode: "55010901", budgetAmount: "30.00" },
          { glCode: "55010902", budgetAmount: "40.00" },
        ],
      },
    ],
  );
});

test("a section row whose budget references cells is skipped while its leaves are stored", async () => {
  const parsed = await parseMisBudgetWorkbook(
    await workbookBuffer((sheet) => {
      addBudgetTable(sheet);
      addGlRow(sheet, 6, {
        lineId: "9",
        component: "Admin Expenses",
        glCode: "55000000",
        aprilBudget: { formula: "K7+K8", result: 132_000 },
        aprilRollover: 0,
        mayBudget: { sharedFormula: "K6", result: 132_000 },
        mayRollover: 0,
      });
      addGlRow(sheet, 7, {
        lineId: "",
        component: "Admin Expenses - One",
        glCode: "55000001",
        aprilBudget: 60_000,
        aprilRollover: 0,
        mayBudget: 60_000,
        mayRollover: 0,
      });
      addGlRow(sheet, 8, {
        lineId: "",
        component: "Admin Expenses - Two",
        glCode: "55000002",
        aprilBudget: 72_000,
        aprilRollover: 0,
        mayBudget: 72_000,
        mayRollover: 0,
      });
    }),
  );

  assert.deepEqual(
    parsed.periods.map(({ rows }) => rows.map(({ glCode, budgetAmount }) => ({ glCode, budgetAmount }))),
    [
      [
        { glCode: "55000001", budgetAmount: "60000.00" },
        { glCode: "55000002", budgetAmount: "72000.00" },
      ],
      [
        { glCode: "55000001", budgetAmount: "60000.00" },
        { glCode: "55000002", budgetAmount: "72000.00" },
      ],
    ],
  );
});

test("a formula without a cell reference remains a leaf value", async () => {
  const parsed = await parseMisBudgetWorkbook(
    await workbookBuffer((sheet) => {
      addBudgetTable(sheet);
      addGlRow(sheet, 6, {
        lineId: "1",
        component: "Admin Expenses",
        glCode: "55000001",
        aprilBudget: { formula: "12000*1.05", result: 12_600 },
        aprilRollover: 0,
        mayBudget: { formula: "12000*1.05", result: 12_600 },
        mayRollover: 0,
      });
    }),
  );

  assert.deepEqual(
    parsed.periods.map(({ rows }) => rows.map(({ glCode, budgetAmount }) => ({ glCode, budgetAmount }))),
    [[{ glCode: "55000001", budgetAmount: "12600.00" }], [{ glCode: "55000001", budgetAmount: "12600.00" }]],
  );
});

test("a following Table-3 block is not ingested as part of the MIS budget table", async () => {
  const parsed = await parseMisBudgetWorkbook(
    await workbookBuffer((sheet) => {
      addBudgetTable(sheet);
      addGlRow(sheet, 6, {
        lineId: "1.1",
        component: "Imported Sprouts",
        glCode: "50001201",
        aprilBudget: 10,
        aprilRollover: 0,
        mayBudget: 20,
        mayRollover: 0,
      });
      addPaymentOfficeTable(sheet, 8);
    }),
  );

  assert.deepEqual(
    parsed.periods.map(({ rows }) => rows.map(({ glCode }) => glCode)),
    [["50001201"], ["50001201"]],
  );
  assert.equal(parsed.validationResult.glRowCount, 1);
});

test("a non-numeric GL code inside the MIS budget table is rejected", async () => {
  await rejectsWithPaths(
    workbookBuffer((sheet) => {
      addBudgetTable(sheet);
      addGlRow(sheet, 6, {
        lineId: "1.1",
        component: "Payment Office",
        glCode: "HO",
        aprilBudget: 10,
        aprilRollover: 0,
        mayBudget: 20,
        mayRollover: 0,
      });
    }),
    ["rows.6.glCode"],
  );
});

test("the budget parser records the workbook outline as an ordered snapshot carrying no amounts and gives each leaf a stable key that survives a reordered workbook", async () => {
  const first = await parseMisBudgetWorkbook(await outlineWorkbook(["materials", "admin"]));
  const reordered = await parseMisBudgetWorkbook(await outlineWorkbook(["admin", "materials"]));

  assert.deepEqual(
    first.outline.map(({ nodeKey, parentKey, depth, sNo, label, sortOrder, glCode, leafKey }) => ({
      nodeKey,
      parentKey,
      depth,
      sNo,
      label,
      sortOrder,
      glCode,
      leafKey,
    })),
    [
      {
        nodeKey: "node:4|materials-primary-nursery",
        parentKey: undefined,
        depth: 0,
        sNo: "4",
        label: "Materials Primary Nursery",
        sortOrder: 0,
        glCode: undefined,
        leafKey: undefined,
      },
      {
        nodeKey: "leaf:4.3|50001603|protrays",
        parentKey: "node:4|materials-primary-nursery",
        depth: 1,
        sNo: "4.3",
        label: "Protrays",
        sortOrder: 1,
        glCode: "50001603",
        leafKey: "4.3|50001603|protrays",
      },
      {
        nodeKey: "node:9|admin-expenses",
        parentKey: undefined,
        depth: 0,
        sNo: "9",
        label: "Admin Expenses",
        sortOrder: 2,
        glCode: undefined,
        leafKey: undefined,
      },
      {
        nodeKey: "node:9.01|vehicle-maintenance",
        parentKey: "node:9|admin-expenses",
        depth: 1,
        sNo: "9.01",
        label: "Vehicle Maintenance",
        sortOrder: 3,
        glCode: undefined,
        leafKey: undefined,
      },
      {
        nodeKey: "leaf:9.01|55010901|petrol-and-diesel-charges",
        parentKey: "node:9.01|vehicle-maintenance",
        depth: 2,
        sNo: undefined,
        label: "Petrol and Diesel Charges",
        sortOrder: 4,
        glCode: "55010901",
        leafKey: "9.01|55010901|petrol-and-diesel-charges",
      },
    ],
  );
  assert.ok(first.outline.every((node) => !Object.keys(node).some((key) => /amount|budget|rollover/i.test(key))));
  assert.deepEqual(
    reordered.outline.flatMap(({ leafKey }) => (leafKey ? [leafKey] : [])).sort(),
    first.outline.flatMap(({ leafKey }) => (leafKey ? [leafKey] : [])).sort(),
  );
});

test("budget ingest reports mapping drift when the candidate outline no longer carries a leaf key the master declares instead of silently splitting the line", async () => {
  const original = await parseMisBudgetWorkbook(
    await workbookBuffer((sheet) => {
      addBudgetTable(sheet);
      addGlRow(sheet, 6, {
        lineId: "1.1",
        component: "Sprout Cost",
        glCode: "50001201",
        aprilBudget: 1,
        aprilRollover: 0,
        mayBudget: 1,
        mayRollover: 0,
      });
    }),
  );
  const renamed = await parseMisBudgetWorkbook(
    await workbookBuffer((sheet) => {
      addBudgetTable(sheet);
      addGlRow(sheet, 6, {
        lineId: "1.1",
        component: "Renamed Sprout Cost",
        glCode: "50001201",
        aprilBudget: 1,
        aprilRollover: 0,
        mayBudget: 1,
        mayRollover: 0,
      });
    }),
  );

  assert.ok(!(original.validationResult.mappingDriftLeafKeys as string[]).includes("1.1|50001201|sprout-cost"));
  assert.ok((renamed.validationResult.mappingDriftLeafKeys as string[]).includes("1.1|50001201|sprout-cost"));
  assert.equal(
    renamed.periods[0].rows[0].leafKey,
    "1.1|50001201|renamed-sprout-cost",
    "the new identity is reported rather than joined to the old target",
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
  sheet.getCell(row, 2).alignment = { indent: values.lineId ? 0 : 1 };
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

async function outlineWorkbook(order: Array<"materials" | "admin">): Promise<Buffer> {
  return workbookBuffer((sheet) => {
    addBudgetTable(sheet);
    let row = 6;
    for (const block of order) {
      if (block === "materials") {
        addGlRow(sheet, row, {
          lineId: "4",
          component: "Materials Primary Nursery",
          glCode: "50001600",
          aprilBudget: { formula: `SUM(K${row + 1})`, result: 1 },
          aprilRollover: 0,
          mayBudget: { formula: `SUM(O${row + 1})`, result: 1 },
          mayRollover: 0,
        });
        addGlRow(sheet, row + 1, {
          lineId: "4.3",
          component: "Protrays",
          glCode: "50001603",
          aprilBudget: 1,
          aprilRollover: 0,
          mayBudget: 1,
          mayRollover: 0,
        });
        sheet.getCell(row + 1, 2).alignment = { indent: 1 };
        row += 2;
      } else {
        addGlRow(sheet, row, {
          lineId: "9",
          component: "Admin Expenses",
          glCode: "55000000",
          aprilBudget: { formula: `SUM(K${row + 1})`, result: 1 },
          aprilRollover: 0,
          mayBudget: { formula: `SUM(O${row + 1})`, result: 1 },
          mayRollover: 0,
        });
        addGlRow(sheet, row + 1, {
          lineId: "9.01",
          component: "Vehicle Maintenance",
          glCode: "55010900",
          aprilBudget: { formula: `SUM(K${row + 2})`, result: 1 },
          aprilRollover: 0,
          mayBudget: { formula: `SUM(O${row + 2})`, result: 1 },
          mayRollover: 0,
        });
        sheet.getCell(row + 1, 2).alignment = { indent: 1 };
        addGlRow(sheet, row + 2, {
          lineId: "",
          component: "Petrol and Diesel Charges",
          glCode: "55010901",
          aprilBudget: 1,
          aprilRollover: 0,
          mayBudget: 1,
          mayRollover: 0,
        });
        sheet.getCell(row + 2, 2).alignment = { indent: 2 };
        row += 3;
      }
    }
  });
}

function addPaymentOfficeTable(sheet: Worksheet, row: number): void {
  sheet.getCell(row, 1).value = "Table-3";
  sheet.getCell(row, 2).value = "Payment Office-wise Budget and Actuals";
  sheet.getCell(row + 2, 1).value = "S. No.";
  sheet.getCell(row + 2, 2).value = "Payment Office";
  ["HO", "LO", "HOD"].forEach((glCode, index) => {
    addGlRow(sheet, row + 3 + index, {
      lineId: String(index + 1),
      component: glCode,
      glCode,
      aprilBudget: 10,
      aprilRollover: 0,
      mayBudget: 20,
      mayRollover: 0,
    });
  });
}
