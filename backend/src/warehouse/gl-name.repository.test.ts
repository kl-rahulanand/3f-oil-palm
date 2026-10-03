import assert from "node:assert/strict";
import { test } from "node:test";
import { SqlValidator } from "../sql/sqlValidator";
import type { DrillPredicate } from "./drill-transactions.interface";
import { GlNameRepository } from "./gl-name.repository";
import type { IPinnedStatementOutlineRepository, StatementOutlineNode } from "./statement-outline.interface";
import type { QueryResult, Warehouse } from "./warehouse.interface";

test("name normalization trims ends collapses internal whitespace and folds case before counting groups", async () => {
  const repository = names([
    { acct_name: "  Sprout   Cost - Imp  ", line_count: "2" },
    { acct_name: "sprout cost - imp", line_count: "1" },
  ]);

  assert.deepEqual(await repository.findGlCodeLabels([glRow("50001201")]), [
    { key: "50001201", label: "Sprout Cost - Imp", otherLabels: [] },
  ]);
});

test("a tie for most-used name and a tie between original spellings are broken alphabetically", async () => {
  const repository = names([
    { acct_name: "sprout cost", line_count: "2" },
    { acct_name: "Sprout Cost", line_count: "2" },
    { acct_name: "Labour", line_count: "4" },
  ]);

  assert.deepEqual(await repository.findGlCodeLabels([glRow("50001201")]), [
    { key: "50001201", label: "Labour", otherLabels: ["Sprout Cost"] },
  ]);
});

test("the more count is represented by distinct normalized names other than the main one", async () => {
  const repository = names([
    { acct_name: "Salaries & Wages", line_count: "8" },
    { acct_name: " Bonus ", line_count: "2" },
    { acct_name: "bonus", line_count: "1" },
    { acct_name: "Overtime", line_count: "1" },
  ]);

  assert.deepEqual(await repository.findGlCodeLabels([glRow("55021000")]), [
    { key: "55021000", label: "Salaries & Wages", otherLabels: ["Bonus", "Overtime"] },
  ]);
});

test("a budget-only code falls back to the first distinct MIS line label in pinned outline order", async () => {
  const repository = names(
    [],
    [
      outline({ nodeKey: "later", sortOrder: 20, glCode: "50009999", label: "Other seedlings" }),
      outline({ nodeKey: "first", sortOrder: 10, glCode: "50009999", label: "Seedlings" }),
      outline({ nodeKey: "duplicate", sortOrder: 30, glCode: "50009999", label: "Seedlings" }),
    ],
  );

  assert.deepEqual(await repository.findGlCodeLabels([glRow("50009999")], "budget-july"), [
    { key: "50009999", label: "Seedlings", otherLabels: ["Other seedlings"] },
  ]);
});

test("a code with neither a scoped SAP name nor a pinned MIS label falls back to its bare code", async () => {
  const repository = names([], [outline({ glCode: "another-code", label: "Another line" })]);

  assert.deepEqual(await repository.findGlCodeLabels([glRow("50009999")], "budget-july"), []);
});

test("a mixed-plant reader sees names only from the executed query's effective plants", async () => {
  const warehouse = new FakeWarehouse([[{ acct_name: "DUB Sprout Cost", line_count: "3" }]]);
  const repository = new GlNameRepository(new SqlValidator(), warehouse, new FakeOutlines());

  const labels = await repository.findGlCodeLabels([
    {
      key: "50001201",
      predicate: {
        ...glPredicate("50001201"),
        plants: ["DUB"],
      },
    },
  ]);

  assert.deepEqual(labels, [{ key: "50001201", label: "DUB Sprout Cost", otherLabels: [] }]);
  assert.match(warehouse.executed[0]!, /txn\.plant IN \('DUB'\)/);
  assert.doesNotMatch(warehouse.executed[0]!, /HYD/);
});

test("statement labels come from the pinned last-month outline after another outline becomes active", async () => {
  const outlines = new FakeOutlines(
    new Map([
      ["budget-july", [outline({ leafKey: "leaf-sprout", sNo: "1.1", label: "Sprout Cost" })]],
      ["budget-august", [outline({ leafKey: "leaf-sprout", sNo: "9.9", label: "Changed label" })]],
    ]),
  );
  outlines.activeBatchId = "budget-august";
  const repository = new GlNameRepository(new SqlValidator(), new FakeWarehouse(), outlines);

  assert.deepEqual(await repository.findStatementLabels(["leaf-sprout"], "budget-july"), [
    { key: "leaf-sprout", label: "1.1 Sprout Cost", otherLabels: [] },
  ]);
});

test("statement answers keep raw leaf keys when there is no last-month budget batch", async () => {
  const repository = names();

  assert.deepEqual(await repository.findStatementLabels(["leaf-sprout"]), []);
});

function names(
  rows: Array<Record<string, string | number | null>> = [],
  outlineNodes: StatementOutlineNode[] = [],
): GlNameRepository {
  return new GlNameRepository(new SqlValidator(), new FakeWarehouse([rows]), new FakeOutlines(undefined, outlineNodes));
}

function glRow(key: string): { key: string; predicate: DrillPredicate } {
  return { key, predicate: glPredicate(key) };
}

function glPredicate(glCode: string): DrillPredicate {
  return {
    mode: "gl-and-plants",
    actualBatchIds: ["actuals-july"],
    glCode,
    plants: ["DUB"],
    filters: [],
    from: "2026-07-01",
    to: "2026-07-01",
  };
}

function outline(overrides: Partial<StatementOutlineNode> = {}): StatementOutlineNode {
  return {
    nodeKey: "sprout",
    parentKey: null,
    depth: 1,
    sNo: "1.1",
    label: "Sprout Cost",
    sortOrder: 1,
    glCode: "50001201",
    leafKey: "leaf-sprout",
    ...overrides,
  };
}

class FakeWarehouse implements Warehouse {
  readonly explained: string[] = [];
  readonly executed: string[] = [];

  constructor(private readonly responses: Array<Array<Record<string, string | number | null>>> = []) {}

  async explain(sql: string): Promise<void> {
    this.explained.push(sql);
  }

  async execute(sql: string): Promise<QueryResult> {
    this.executed.push(sql);
    return { columns: [], rows: this.responses.shift() ?? [] };
  }

  async freshness(): Promise<null> {
    return null;
  }

  async distinctValues(): Promise<string[]> {
    return [];
  }
}

class FakeOutlines implements IPinnedStatementOutlineRepository {
  activeBatchId?: string;

  constructor(
    private readonly byBatch = new Map<string, StatementOutlineNode[]>(),
    private readonly defaultNodes: StatementOutlineNode[] = [],
  ) {}

  async findByBudgetPeriod(): Promise<StatementOutlineNode[]> {
    return this.activeBatchId ? (this.byBatch.get(this.activeBatchId) ?? []) : this.defaultNodes;
  }

  async findByBudgetBatchId(batchId: string): Promise<StatementOutlineNode[]> {
    return this.byBatch.get(batchId) ?? this.defaultNodes;
  }
}
