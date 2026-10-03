import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../config";
import { SqlValidator } from "../sql/sqlValidator";
import type { DrillPredicate } from "./drill-transactions.interface";
import { GlNameRepository } from "./gl-name.repository";
import { createWarehouseDb, createWarehouseWritePool, IngestionRepository } from "./ingestion.repository";
import { PostgresAdapter } from "./postgres.adapter";
import type { IPinnedStatementOutlineRepository, StatementOutlineNode } from "./statement-outline.interface";
import { StatementOutlineRepository } from "./statement-outline.repository";
import { migrateWarehouse } from "./warehouse-migrate";
import type { QueryResult, Warehouse } from "./warehouse.interface";

const JULY = "2026-07-01";

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

test("a code with scoped blank-named SAP lines stays bare even when the pinned outline names the same code", async () => {
  const repository = names(
    [{ acct_name: "   ", line_count: "1", scoped_line_count: "1" }],
    [outline({ glCode: "50009999", label: "Must not replace a blank SAP name" })],
  );

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

test("the destructive GL name proof refuses every target except the throwaway warehouse on port 5434", () => {
  assert.throws(() => assertThrowawayWarehouse("127.0.0.1", "5433"), /throwaway warehouse/);
  assert.throws(() => assertThrowawayWarehouse("warehouse.shared.example", "5434"), /throwaway warehouse/);
});

test(
  "WAREHOUSE_DB_TEST resolves GL and statement labels through real Postgres under the executed scope",
  { skip: process.env.WAREHOUSE_DB_TEST !== "1" },
  async (context) => {
    assertThrowawayWarehouse(process.env.WAREHOUSE_PG_HOST, process.env.WAREHOUSE_PG_PORT);
    await migrateWarehouse();
    const pool = await createWarehouseWritePool();
    try {
      await pool.query("TRUNCATE sap_transaction, mis_budget, ingest_batch CASCADE");
      const ingestion = new IngestionRepository(createWarehouseDb(pool));
      const maxRows = loadConfig().maxRows;
      const actualBatchId = await ingestion.replaceActualsBatch(metadata(), fixtureActuals(maxRows));
      const budgetBatchId = await ingestion.replaceBudgetBatch(metadata(), [], fixtureOutline());
      const warehouse = new PostgresAdapter();
      const repository = new GlNameRepository(new SqlValidator(), warehouse, new StatementOutlineRepository(warehouse));
      const codes = ["50000001", "50000002", "50000003", "50000004", "50000005", "50000006", "50000007"];
      const labels = new Map(
        (
          await repository.findGlCodeLabels(
            codes.map((code) => ({ key: code, predicate: dbPredicate(code, actualBatchId) })),
            budgetBatchId,
          )
        ).map((label) => [label.key, label]),
      );

      await context.test("a majority SAP name includes normalized variants and keeps distinct other groups", () => {
        assert.deepEqual(labels.get("50000001"), {
          key: "50000001",
          label: "Sprout Cost",
          otherLabels: ["Seedling Labour"],
        });
      });
      await context.test("a tied SAP name group is ordered alphabetically", () => {
        assert.deepEqual(labels.get("50000002"), {
          key: "50000002",
          label: "Alpha Name",
          otherLabels: ["Beta Name"],
        });
      });
      await context.test("a blank-named SAP line stays bare even when the pinned outline names that code", () => {
        assert.equal(labels.has("50000003"), false);
      });
      await context.test("a budget-only code uses its pinned MIS label while a code with nothing stays bare", () => {
        assert.deepEqual(labels.get("50000004"), {
          key: "50000004",
          label: "Budget-only line",
          otherLabels: [],
        });
        assert.equal(labels.has("50000005"), false);
      });
      await context.test("a second plant's more frequent name is excluded by the executed DUB scope", () => {
        assert.deepEqual(labels.get("50000006"), {
          key: "50000006",
          label: "DUB Name",
          otherLabels: [],
        });
      });
      await context.test(
        "normalized variants are grouped before more raw spellings than the result cap are ranked",
        () => {
          assert.deepEqual(labels.get("50000007"), {
            key: "50000007",
            label: "Cap Winner",
            otherLabels: ["Cap Runner"],
          });
        },
      );
      await context.test(
        "statement labels use the pinned outline and stay raw when no budget batch is pinned",
        async () => {
          assert.deepEqual(await repository.findStatementLabels(["statement-leaf"], budgetBatchId), [
            { key: "statement-leaf", label: "7.1 Pinned Statement", otherLabels: [] },
          ]);
          assert.deepEqual(await repository.findStatementLabels(["statement-leaf"]), []);
        },
      );
    } finally {
      await pool.end();
    }
  },
);

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

function dbPredicate(glCode: string, actualBatchId: string): DrillPredicate {
  return { ...glPredicate(glCode), actualBatchIds: [actualBatchId] };
}

function metadata() {
  return {
    period: JULY,
    uploadedBy: "gl-name-proof",
    validationResult: { valid: true },
    reconciliationResult: { fixture: true },
  };
}

function fixtureActuals(maxRows: number) {
  let sequence = 0;
  const rows = [
    ...Array.from({ length: 3 }, () => actualRow(++sequence, "50000001", "Sprout Cost")),
    ...Array.from({ length: 2 }, () => actualRow(++sequence, "50000001", "  sprout   cost  ")),
    ...Array.from({ length: 2 }, () => actualRow(++sequence, "50000001", "Seedling Labour")),
    ...Array.from({ length: 2 }, () => actualRow(++sequence, "50000002", "Alpha Name")),
    ...Array.from({ length: 2 }, () => actualRow(++sequence, "50000002", "Beta Name")),
    actualRow(++sequence, "50000003", "   "),
    actualRow(++sequence, "50000006", "DUB Name"),
    ...Array.from({ length: 5 }, () => actualRow(++sequence, "50000006", "HYD Name", "HYD")),
    ...Array.from({ length: maxRows + 1 }, (_, index) =>
      actualRow(++sequence, "50000007", `Cap Winner${" ".repeat(index + 1)}`),
    ),
    ...Array.from({ length: maxRows }, () => actualRow(++sequence, "50000007", "Cap Runner")),
  ];
  return rows;
}

function actualRow(sequence: number, glCode: string, acctName: string, plant = "DUB") {
  return {
    txnNo: `TXN-${sequence}`,
    lineId: "1",
    postingDate: JULY,
    month: JULY,
    plant,
    plantSrc: `${plant}-NUR`,
    costCenter: "Nursery",
    glCode,
    acctName,
    debit: "1.00",
    credit: "0.00",
    raw: {},
  };
}

function fixtureOutline() {
  return [
    dbOutline("blank-line", "3.1", "Must not replace blank SAP lines", 1, "50000003", "blank-leaf"),
    dbOutline("budget-line", "4.1", "Budget-only line", 2, "50000004", "budget-leaf"),
    dbOutline("statement-line", "7.1", "Pinned Statement", 3, "50000008", "statement-leaf"),
  ];
}

function dbOutline(nodeKey: string, sNo: string, label: string, sortOrder: number, glCode: string, leafKey: string) {
  return { nodeKey, parentKey: null, depth: 1, sNo, label, sortOrder, glCode, leafKey };
}

function assertThrowawayWarehouse(host: string | undefined, port: string | undefined): void {
  assert.ok(
    host === "127.0.0.1" && port === "5434",
    "WAREHOUSE_DB_TEST requires the throwaway warehouse at 127.0.0.1:5434",
  );
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
