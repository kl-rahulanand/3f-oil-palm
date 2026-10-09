import assert from "node:assert/strict";
import test from "node:test";
import { Workbook, type CellValue, type Worksheet } from "exceljs";
import { z } from "zod";
import { parseFinancialBudgetWorkbook, type FinancialBudgetComponent } from "./financial-budget.parser";
import { validateFinancialMappingSeed, type FinancialMappingSeedEntry } from "./financial-mapping.seed";

test("done-when 5: the independent Budget parser preserves repeated and missing GL leaves without parent fan-out", async () => {
  const parsed = await parseFinancialBudgetWorkbook(await budgetWorkbook(), "DUB");

  assert.deepEqual(
    parsed.components.map(({ componentKey, parentComponentKey, componentName, isLeaf }) => ({
      componentKey,
      parentComponentKey,
      componentName,
      isLeaf,
    })),
    [
      {
        componentKey: "1|imported-sprouts",
        parentComponentKey: null,
        componentName: "Imported Sprouts",
        isLeaf: false,
      },
      {
        componentKey: "1|imported-sprouts/1.1|50001201|sprout-cost",
        parentComponentKey: "1|imported-sprouts",
        componentName: "Sprout Cost",
        isLeaf: true,
      },
      {
        componentKey: "1|imported-sprouts/1.2|50001201|clearing-forwarding",
        parentComponentKey: "1|imported-sprouts",
        componentName: "Clearing & Forwarding",
        isLeaf: true,
      },
      {
        componentKey: "1|imported-sprouts/1.3|no-gl|bank-charges",
        parentComponentKey: "1|imported-sprouts",
        componentName: "Bank Charges",
        isLeaf: true,
      },
    ],
  );
  assert.deepEqual(
    parsed.budgetRows.map(({ componentKey, reportingMonth, glCode, budgetAmount, rolloverAmount }) => ({
      componentKey,
      reportingMonth,
      glCode,
      budgetAmount,
      rolloverAmount,
    })),
    [
      {
        componentKey: "1|imported-sprouts/1.1|50001201|sprout-cost",
        reportingMonth: "2026-04-01",
        glCode: "50001201",
        budgetAmount: "10.00",
        rolloverAmount: "1.00",
      },
      {
        componentKey: "1|imported-sprouts/1.2|50001201|clearing-forwarding",
        reportingMonth: "2026-04-01",
        glCode: "50001201",
        budgetAmount: "20.00",
        rolloverAmount: "2.00",
      },
      {
        componentKey: "1|imported-sprouts/1.3|no-gl|bank-charges",
        reportingMonth: "2026-04-01",
        glCode: null,
        budgetAmount: "0.00",
        rolloverAmount: "0.00",
      },
    ],
  );
  assert.equal(parsed.validation.leafCount, 3);
  assert.equal(parsed.validation.budgetRowCount, 3);
});

test("done-when 5: the Budget parser retains hierarchy metadata and cached formula evidence while excluding formula parents", async () => {
  const parsed = await parseFinancialBudgetWorkbook(await budgetWorkbook(), "DUB");
  const leaf = parsed.components[1]!;
  const row = parsed.budgetRows[0]!;

  assert.deepEqual(
    {
      sNo: leaf.sNo,
      depth: leaf.depth,
      sortOrder: leaf.sortOrder,
      paymentOffice: row.paymentOffice,
      rolloverEnabled: row.rolloverEnabled,
      budgetEvidence: row.moneyEvidence.budget,
      rolloverEvidence: row.moneyEvidence.rollover,
    },
    {
      sNo: "1.1",
      depth: 1,
      sortOrder: 1,
      paymentOffice: "HO",
      rolloverEnabled: true,
      budgetEvidence: { raw: "10", rounded: "10.00", roundingDelta: "0.00" },
      rolloverEvidence: { raw: "1", rounded: "1.00", roundingDelta: "0.00" },
    },
  );
  assert.equal(
    parsed.budgetRows.some(({ componentKey }) => componentKey === parsed.components[0]!.componentKey),
    false,
  );
});

test("done-when 5: a nested Budget leaf inherits its source Payment Office from the hierarchy", async () => {
  const parsed = await parseFinancialBudgetWorkbook(
    await budgetWorkbook((sheet) => {
      sheet.getCell(5, 4).value = "HOD";
      sheet.getCell(6, 4).value = null;
    }),
    "DUB",
  );

  assert.equal(parsed.budgetRows[0]!.paymentOffice, "HOD");
  assert.equal(parsed.budgetRows[0]!.sourceRow["Payment Office"], null);
});

test("done-when 5: a formula grand total and trailing diagnostics are not Budget facts", async () => {
  const parsed = await parseFinancialBudgetWorkbook(
    await budgetWorkbook((sheet) => {
      sheet.getCell(9, 7).value = { formula: "SUM(G5:G8)", result: 60 };
      sheet.getCell(9, 8).value = { formula: "SUM(H5:H8)", result: 6 };
      sheet.getCell(10, 7).value = 999;
    }),
    "DUB",
  );

  assert.equal(parsed.validation.componentCount, 4);
  assert.equal(parsed.validation.budgetRowCount, 3);
});

test("done-when 5: monthly unpivot keeps distinct non-contiguous source months and numeric zero", async () => {
  const parsed = await parseFinancialBudgetWorkbook(
    await budgetWorkbook((sheet) => {
      addMonthBlock(sheet, 11, "2026-06-01");
      sheet.getCell(5, 11).value = { formula: "SUM(K6:K8)", result: 7 };
      sheet.getCell(5, 12).value = { formula: "SUM(L6:L8)", result: 4 };
      sheet.getCell(6, 11).value = 7;
      sheet.getCell(6, 12).value = 4;
      sheet.getCell(7, 11).value = 0;
      sheet.getCell(7, 12).value = 0;
      sheet.getCell(8, 11).value = 0;
      sheet.getCell(8, 12).value = 0;
    }),
    "DUB",
  );

  assert.deepEqual(parsed.validation.sourceReportingMonths, ["2026-04-01", "2026-06-01"]);
  assert.deepEqual(
    parsed.budgetRows
      .filter(({ componentKey }) => componentKey.includes("clearing-forwarding"))
      .map(({ reportingMonth, budgetAmount, rolloverAmount }) => ({
        reportingMonth,
        budgetAmount,
        rolloverAmount,
      })),
    [
      { reportingMonth: "2026-04-01", budgetAmount: "20.00", rolloverAmount: "2.00" },
      { reportingMonth: "2026-06-01", budgetAmount: "0.00", rolloverAmount: "0.00" },
    ],
  );
});

test("done-when 5: blank monthly money refuses use instead of becoming a loaded zero", async () => {
  await assert.rejects(
    parseFinancialBudgetWorkbook(
      await budgetWorkbook((sheet) => {
        sheet.getCell(6, 7).value = null;
        sheet.getCell(7, 8).value = null;
      }),
      "DUB",
    ),
    (error: unknown) => {
      assert.ok(error instanceof z.ZodError);
      assert.deepEqual(
        error.issues.map(({ path, message }) => ({ path, message })),
        [
          {
            path: ["rows", 6, "2026-04-01", "Budget"],
            message: "Budget is required; use numeric zero for a loaded zero",
          },
          {
            path: ["rows", 7, "2026-04-01", "Roll Over Budget"],
            message: "Roll Over Budget is required; use numeric zero for a loaded zero",
          },
        ],
      );
      return true;
    },
  );
});

test("done-when 5: an uncached monthly formula blocks Budget use instead of becoming zero", async () => {
  await assert.rejects(
    parseFinancialBudgetWorkbook(
      await budgetWorkbook((sheet) => {
        sheet.getCell(6, 7).value = { formula: "5+5" };
      }),
      "DUB",
    ),
    (error: unknown) => {
      assert.ok(error instanceof z.ZodError);
      assert.deepEqual(
        error.issues.map(({ path, message }) => ({ path, message })),
        [
          {
            path: ["rows", 6, "2026-04-01", "Budget"],
            message: "Formula has no cached result; recalculate and save the workbook",
          },
        ],
      );
      return true;
    },
  );
});

test("done-when 5: duplicate component identities refuse the Budget source", async () => {
  await assert.rejects(
    parseFinancialBudgetWorkbook(
      await budgetWorkbook((sheet) => {
        addLeaf(sheet, 9, {
          sNo: "1.1",
          name: "Sprout Cost",
          glCode: "50001201",
          budget: 30,
          rollover: 3,
        });
      }),
      "DUB",
    ),
    (error: unknown) =>
      error instanceof z.ZodError &&
      error.issues.some(
        ({ path, message }) =>
          path.join(".") === "rows.9.componentKey" && message === "Component identity is duplicated",
      ),
  );
});

test("done-when 1: mapping validation refuses collisions, foreign owners and missing target leaves", () => {
  const components = componentFixture();
  const base: FinancialMappingSeedEntry = {
    plantCode: "DUB",
    sourcePlantAliases: ["DUB-NUR"],
    costCenterCode: "Primary",
    glCode: "50001201",
    targetComponentKey: components[1]!.componentKey,
    approvalStatus: "provisional",
    approvalReason: "Awaiting authoritative client mapping master",
    approvedBy: "project-owner",
    provenance: "docs/context/2026-08-20-srihari-phase1-data/README.md",
  };

  assert.throws(
    () =>
      validateFinancialMappingSeed(
        [base, { ...base, targetComponentKey: components[2]!.componentKey }],
        components,
        "DUB",
      ),
    (error: unknown) =>
      error instanceof z.ZodError &&
      error.issues.some(
        ({ path, message }) => path.join(".") === "mappings.1" && message === "Mapping tuple has multiple targets",
      ),
  );
  assert.throws(
    () => validateFinancialMappingSeed([{ ...base, plantCode: "CHIR" }], components, "DUB"),
    (error: unknown) =>
      error instanceof z.ZodError &&
      error.issues.some(
        ({ path, message }) =>
          path.join(".") === "mappings.0.plantCode" && message === "Mapping Plant must own the Budget",
      ),
  );
  assert.throws(
    () => validateFinancialMappingSeed([{ ...base, plantCode: "CHIR" }], components, "CHIR"),
    (error: unknown) =>
      error instanceof z.ZodError &&
      error.issues.some(
        ({ path, message }) => path.join(".") === "file.budgetOwner" && message === "Budget owner must be DUB",
      ),
  );
  assert.throws(
    () => validateFinancialMappingSeed([{ ...base, targetComponentKey: "missing" }], components, "DUB"),
    (error: unknown) =>
      error instanceof z.ZodError &&
      error.issues.some(
        ({ path, message }) =>
          path.join(".") === "mappings.0.targetComponentKey" && message === "Mapping target is not a Budget leaf",
      ),
  );
});

test("done-when 1: mapping validation resolves the governed leaf identity without guessing from its name", () => {
  const components = componentFixture();
  const validated = validateFinancialMappingSeed(
    [
      {
        plantCode: "DUB",
        sourcePlantAliases: ["DUB-NUR"],
        costCenterCode: "Primary",
        glCode: "50001201",
        targetComponentKey: "1.1|50001201|sprout-cost",
        approvalStatus: "provisional",
        approvalReason: "Awaiting authoritative client mapping master",
        approvedBy: "project-owner",
        provenance: "docs/context/2026-08-20-srihari-phase1-data/README.md",
      },
    ],
    components,
    "DUB",
  );

  assert.equal(validated[0]!.targetComponentKey, components[1]!.componentKey);
  assert.equal(validated[0]!.approvalStatus, "provisional");
});

test("done-when 1: parsed nested leaves cross to governed inherited-serial mapping identities", async () => {
  const parsed = await parseFinancialBudgetWorkbook(
    await budgetWorkbook((sheet) => {
      addParent(sheet, 9, "9.01", "Vehicle Maintenance", 52, 52, 1);
      addLeaf(sheet, 10, {
        sNo: "",
        name: "Petrol and Diesel Charges",
        glCode: "55010901",
        budget: 52,
        rollover: 52,
      });
      sheet.getCell(10, 2).alignment = { indent: 2 };
    }),
    "DUB",
  );
  const mapping = validateFinancialMappingSeed(
    [
      {
        plantCode: "DUB",
        sourcePlantAliases: ["DUB-NUR"],
        costCenterCode: "Admin",
        glCode: "55010901",
        targetComponentKey: "9.01|55010901|petrol-and-diesel-charges",
        approvalStatus: "provisional",
        approvalReason: "Awaiting authoritative client mapping master",
        approvedBy: "provisional-seed",
        provenance: "docs/context/2026-08-20-srihari-phase1-data/README.md",
      },
    ],
    parsed.components,
    "DUB",
  );

  assert.match(mapping[0]!.targetComponentKey, /\/9\.01\|55010901\|petrol-and-diesel-charges$/);
  assert.equal(parsed.components.find(({ sourceRowNumber }) => sourceRowNumber === 10)!.sNo, null);
});

async function budgetWorkbook(change?: (sheet: Worksheet) => void): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.addWorksheet("5 Months Financial Data");
  const sheet = workbook.addWorksheet("Nursery Fincail MIS ");
  sheet.getCell(3, 1).value = "S. No.";
  sheet.getCell(3, 2).value = "Budget Components";
  sheet.getCell(3, 3).value = "Rollover (Y/N)";
  sheet.getCell(3, 4).value = "Payment Office";
  sheet.getCell(3, 6).value = "GL Codes";
  addMonthBlock(sheet, 7, "2026-04-01");

  addParent(sheet, 5, "1", "Imported Sprouts", 30, 3, 0);
  addLeaf(sheet, 6, { sNo: "1.1", name: "Sprout Cost", glCode: "50001201", budget: 10, rollover: 1 });
  addLeaf(sheet, 7, {
    sNo: "1.2",
    name: "Clearing & Forwarding",
    glCode: "50001201",
    budget: 20,
    rollover: 2,
    paymentOffice: "LO",
    rolloverEnabled: false,
  });
  addLeaf(sheet, 8, { sNo: "1.3", name: "Bank Charges", glCode: null, budget: 0, rollover: 0 });
  change?.(sheet);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function addMonthBlock(sheet: Worksheet, column: number, month: string): void {
  sheet.mergeCells(3, column, 3, column + 3);
  sheet.getCell(3, column).value = new Date(`${month}T00:00:00.000Z`);
  ["Budget", "Roll Over Budget", "Actual", "%"].forEach((header, offset) => {
    sheet.getCell(4, column + offset).value = header;
  });
}

function addParent(
  sheet: Worksheet,
  row: number,
  sNo: string,
  name: string,
  budget: number,
  rollover: number,
  depth: number,
): void {
  sheet.getCell(row, 1).value = sNo;
  sheet.getCell(row, 2).value = name;
  sheet.getCell(row, 2).alignment = { indent: depth };
  sheet.getCell(row, 7).value = { formula: `SUM(G${row + 1})`, result: budget };
  sheet.getCell(row, 8).value = { formula: `SUM(H${row + 1})`, result: rollover };
}

function addLeaf(
  sheet: Worksheet,
  row: number,
  values: {
    sNo: string;
    name: string;
    glCode: string | null;
    budget: CellValue;
    rollover: CellValue;
    paymentOffice?: string;
    rolloverEnabled?: boolean;
  },
): void {
  sheet.getCell(row, 1).value = values.sNo;
  sheet.getCell(row, 2).value = values.name;
  sheet.getCell(row, 2).alignment = { indent: 1 };
  sheet.getCell(row, 3).value = values.rolloverEnabled === false ? "N" : "Y";
  sheet.getCell(row, 4).value = values.paymentOffice ?? "HO";
  sheet.getCell(row, 6).value = values.glCode;
  sheet.getCell(row, 7).value = values.budget;
  sheet.getCell(row, 8).value = values.rollover;
}

function componentFixture(): FinancialBudgetComponent[] {
  return [
    {
      componentKey: "1|imported-sprouts",
      parentComponentKey: null,
      sNo: "1",
      componentName: "Imported Sprouts",
      depth: 0,
      sortOrder: 0,
      isLeaf: false,
      sourceRowNumber: 5,
      sourceRow: {},
    },
    {
      componentKey: "1|imported-sprouts/1.1|50001201|sprout-cost",
      parentComponentKey: "1|imported-sprouts",
      sNo: "1.1",
      componentName: "Sprout Cost",
      depth: 1,
      sortOrder: 1,
      isLeaf: true,
      sourceRowNumber: 6,
      sourceRow: {},
    },
    {
      componentKey: "1|imported-sprouts/1.2|50001201|clearing-forwarding",
      parentComponentKey: "1|imported-sprouts",
      sNo: "1.2",
      componentName: "Clearing & Forwarding",
      depth: 1,
      sortOrder: 2,
      isLeaf: true,
      sourceRowNumber: 7,
      sourceRow: {},
    },
  ];
}
