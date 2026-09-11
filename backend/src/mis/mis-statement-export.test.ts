import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ExecutionContext, HttpException, StreamableFile } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import type {
  AuthUser,
  FixedScaleMoney,
  MisSelectionRunRequest,
  MisStatementMeasureBlock,
  MisStatementNode,
  MisStatementResolvedResponse,
  MisStatementRunResponse,
} from "@3f/contract";
import type { Response } from "express";
import { ValueType, Workbook, type Worksheet } from "exceljs";
import type { AuthedRequest } from "../auth/auth.guard";
import type { IMisStatementExportService } from "./mis-statement-export.interface";
import { MisStatementExportService } from "./mis-statement-export.service";
import { MisStatementController } from "./mis-statement.controller";
import type { IMisStatementService } from "./mis-statement.interface";

test("the export route calls the statement service once and branches before setting headers so a resolved request streams an xlsx with the canonical slug filename while an unresolvable request returns plain json with no file headers", async () => {
  const headers = new Map<string, string>();
  const response = {
    setHeader(name: string, value: string) {
      headers.set(name, value);
      return this;
    },
  } as unknown as Response;
  const outcomes: MisStatementRunResponse[] = [statement(), unresolvable];
  let runs = 0;
  const statements: IMisStatementService = {
    async run() {
      runs += 1;
      return outcomes.shift()!;
    },
  };
  let writes = 0;
  const exporter: IMisStatementExportService = {
    async write() {
      writes += 1;
      assert.equal(headers.size, 0);
      return Buffer.from("xlsx");
    },
  };
  const controller = new MisStatementController(statements, exporter);

  const file = await controller.export(user, request, response);
  assert.ok(file instanceof StreamableFile);
  assert.equal(runs, 1);
  assert.equal(writes, 1);
  assert.equal(headers.get("Content-Type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(
    headers.get("Content-Disposition"),
    'attachment; filename="financial-mis-agriculture-ops-nursery-function-dub-plant-2026-07-01-to-2026-07-31.xlsx"',
  );

  headers.clear();
  assert.deepEqual(await controller.export(user, request, response), unresolvable);
  assert.equal(runs, 2);
  assert.equal(writes, 1);
  assert.equal(headers.size, 0);

  const [ReportGuard] = Reflect.getMetadata(GUARDS_METADATA, MisStatementController.prototype.export) as Array<
    new () => { canActivate(context: ExecutionContext): boolean }
  >;
  assert.throws(
    () => new ReportGuard().canActivate(context({ ...user, permissions: { ...user.permissions, actions: [] } })),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 403,
  );
  assert.equal(new ReportGuard().canActivate(context(user)), true);
});

test("the reopened workbook equals the statement payload cell by cell on the financial mis worksheet including derived parent subtotals the grand total row the unmapped GL line and the empty rollover column", async () => {
  const worksheet = await reopen(statement());

  assert.equal(worksheet.name, "Financial MIS");
  assert.deepEqual(cells(worksheet, 1, 11), [
    "Financial MIS",
    "Financial MIS",
    "Financial MIS",
    "July 2026",
    "July 2026",
    "July 2026",
    "July 2026",
    "FY 26-27 YTD",
    "FY 26-27 YTD",
    "FY 26-27 YTD",
    "FY 26-27 YTD",
  ]);
  assert.deepEqual(cells(worksheet, 2, 11), [
    "S. No.",
    "Budget Component",
    "GL Code",
    "Budget",
    "Roll-over",
    "Actual",
    "%",
    "Budget",
    "Roll-over",
    "Actual",
    "%",
  ]);
  assert.deepEqual(cells(worksheet, 3, 11), ["1", "Derived parent", null, 101, null, 80, 0.8, 200, null, 181, 0.9]);
  assert.deepEqual(cells(worksheet, 4, 11), ["1.1", "Leaf one", "5001", 40, null, 30, 0.75, 80, null, 70, 0.875]);
  assert.deepEqual(cells(worksheet, 5, 11), ["1.2", "Leaf two", "5002", 61, null, 50, 0.8264, 120, null, 111, 0.9205]);
  assert.deepEqual(cells(worksheet, 6, 11), [
    null,
    "unmapped-GL",
    null,
    0,
    null,
    5,
    "over-budget",
    0,
    null,
    8,
    "over-budget",
  ]);
  assert.deepEqual(cells(worksheet, 7, 11), [
    "Grand Total",
    "Grand Total",
    "Grand Total",
    101,
    null,
    85,
    0.8506,
    200,
    null,
    189,
    0.9404,
  ]);
  assert.equal(worksheet.getRow(3).outlineLevel, 1);
  assert.equal(worksheet.getRow(4).outlineLevel, 2);
  assert.equal(worksheet.getRow(5).outlineLevel, 2);
  assert.equal(worksheet.getRow(6).outlineLevel, 1);
  assert.equal(worksheet.getCell("A7").isMerged, true);
  assert.equal(worksheet.getCell("C7").isMerged, true);
});

test("amounts are numbers rounded to the rupee with a rupee format a numeric percentage is a number with a percentage format a label is literal text and a null percentage is NA with one header group per present block", async () => {
  const roots = [
    node("numeric", "1.50", "-1.50", "0.125"),
    node("label", "1.49", "2.49", "credit / negative actual"),
    node("null", "-1.49", "0.49", null),
  ];
  const worksheet = await reopen(statement(roots, node("Grand Total", "1.50", "1.50", "1"), true));

  assert.equal(worksheet.columnCount, 7);
  assert.equal(worksheet.getCell("D1").value, "July 2026");
  assert.equal(worksheet.getCell("G1").isMerged, true);
  assert.equal(worksheet.getCell("H1").value, null);
  assert.equal(worksheet.getCell("D3").value, 2);
  assert.equal(worksheet.getCell("F3").value, -2);
  assert.equal(worksheet.getCell("D4").value, 1);
  assert.equal(worksheet.getCell("D5").value, -1);
  assert.equal(typeof worksheet.getCell("D3").value, "number");
  assert.equal(worksheet.getCell("D3").numFmt, "₹#,##0;[Red]-₹#,##0");
  assert.equal(worksheet.getCell("G3").value, 0.125);
  assert.equal(worksheet.getCell("G3").numFmt, "0.00%");
  assert.equal(worksheet.getCell("G4").value, "credit / negative actual");
  assert.equal(worksheet.getCell("G5").value, "NA");
  assert.equal(worksheet.getCell("E3").value, null);
});

test("a text cell whose value begins with an equals plus minus or at sign is neutralised so it does not reopen as a formula", async () => {
  const roots = ["=SUM(A1:A2)", "+cmd", "-2+3", "@user"].map((value) => ({
    ...node(value, "0.00", "0.00", null),
    sNo: value,
    budgetComponent: value,
    glCode: value,
  }));
  const worksheet = await reopen(statement(roots, node("Grand Total", "0.00", "0.00", null), true));

  roots.forEach((source, index) => {
    [1, 2, 3].forEach((column) => {
      const cell = worksheet.getCell(3 + index, column);
      assert.equal(cell.value, `'${source.sNo}`);
      assert.notEqual(cell.type, ValueType.Formula);
    });
  });
});

async function reopen(payload: MisStatementResolvedResponse): Promise<Worksheet> {
  const buffer = await new MisStatementExportService().write(payload);
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  return workbook.getWorksheet("Financial MIS")!;
}

function cells(worksheet: Worksheet, row: number, lastColumn: number): unknown[] {
  return Array.from({ length: lastColumn }, (_, index) => worksheet.getCell(row, index + 1).value);
}

function statement(
  tree: MisStatementNode[] = defaultTree,
  grandTotal: MisStatementNode = defaultGrandTotal,
  oneBlock = false,
): MisStatementResolvedResponse {
  const presentTree = oneBlock ? tree.map(onlySelected) : tree;
  return {
    outcome: "resolved",
    scope: {
      department: "Agrículture & Ops",
      function: "Nursery / Function",
      plant: "DÜB Plant",
      period: "2026-07-01",
      costCentres: ["Primary"],
      glCodes: ["5001"],
      misFormat: "nursery-mis-financial-v1",
    },
    tree: presentTree,
    grandTotal: oneBlock ? onlySelected(grandTotal) : grandTotal,
    provenance: { activeBatchIds: [] },
  };
}

function onlySelected(value: MisStatementNode): MisStatementNode {
  return { ...value, measures: value.measures.slice(0, 1), children: value.children.map(onlySelected) };
}

function node(
  budgetComponent: string,
  budget: FixedScaleMoney,
  actual: FixedScaleMoney,
  percentage: string | null,
  children: MisStatementNode[] = [],
): MisStatementNode {
  return {
    nodeKey: budgetComponent,
    sNo: budgetComponent,
    budgetComponent,
    glCode: "5000",
    measures: [block("selected", "July 2026", budget, actual, percentage)],
    children,
  };
}

function block(
  key: "selected" | "fy26-27-ytd",
  label: string,
  budget: FixedScaleMoney,
  actual: FixedScaleMoney,
  percentage: string | null,
): MisStatementMeasureBlock {
  return {
    key,
    label,
    from: "2026-07-01",
    to: "2026-07-31",
    budget,
    rollover: null,
    actual,
    percentage,
    sourcePresence: [],
  };
}

const defaultTree: MisStatementNode[] = [
  {
    ...node("Derived parent", "100.50", "80.49", "0.8", [
      node("Leaf one", "40.00", "30.00", "0.75"),
      node("Leaf two", "60.50", "50.49", "0.8264"),
    ]),
    sNo: "1",
    glCode: null,
  },
  { ...node("unmapped-GL", "0.00", "5.00", "over-budget"), sNo: null, glCode: null },
];

defaultTree[0].measures.push(block("fy26-27-ytd", "FY 26-27 YTD", "200.49", "180.50", "0.9"));
defaultTree[0].children[0].sNo = "1.1";
defaultTree[0].children[0].budgetComponent = "Leaf one";
defaultTree[0].children[0].glCode = "5001";
defaultTree[0].children[0].measures.push(block("fy26-27-ytd", "FY 26-27 YTD", "80.00", "70.00", "0.875"));
defaultTree[0].children[1].sNo = "1.2";
defaultTree[0].children[1].budgetComponent = "Leaf two";
defaultTree[0].children[1].glCode = "5002";
defaultTree[0].children[1].measures.push(block("fy26-27-ytd", "FY 26-27 YTD", "120.49", "110.50", "0.9205"));
defaultTree[1].measures.push(block("fy26-27-ytd", "FY 26-27 YTD", "0.00", "8.00", "over-budget"));

const defaultGrandTotal: MisStatementNode = {
  ...node("Grand Total", "100.50", "85.49", "0.8506"),
  sNo: null,
  glCode: null,
};
defaultGrandTotal.measures.push(block("fy26-27-ytd", "FY 26-27 YTD", "200.49", "188.50", "0.9404"));

const request: MisSelectionRunRequest = {
  department: "Agriculture",
  function: "Nursery",
  plant: "DUB",
  period: "2026-07-01",
};

const unresolvable: MisStatementRunResponse = {
  outcome: "unresolvable",
  notice: "No mapping configured",
  tree: [],
  grandTotal: null,
  provenance: { activeBatchIds: [] },
};

function context(authUser: AuthUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ authUser }) as AuthedRequest }),
  } as ExecutionContext;
}

const user: AuthUser = {
  id: "user-1",
  email: "finance@example.com",
  display_name: "Finance",
  is_active: true,
  roles: ["admin"],
  permissions: {
    actions: ["report"],
    domains: ["mis-statement"],
    measureIds: [],
    dimensionIds: [],
  },
  scope: [{ attribute: "plant", value: "DUB" }],
};
