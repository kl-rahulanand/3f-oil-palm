import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser, SelectionFilter } from "@3f/contract";
import { SemanticLayer } from "../semantic/semanticLayer";
import { SqlBuilder } from "../sql/sqlBuilder";
import { SqlValidator } from "../sql/sqlValidator";
import type { Warehouse } from "./warehouse.interface";
import { DrillTransactionsRepository, normalizeDateOnly } from "./drill-transactions.repository";
import { toStarRocksMysqlCell } from "./starrocks-mysql.adapter";

test("the drill page and footer queries share one predicate and emit the deterministic order with a bounded limit the validator accepts", async () => {
  const warehouse = new FakeWarehouse();
  const repository = new DrillTransactionsRepository(new SqlValidator(), warehouse);
  const queries = repository.buildQueries(
    {
      actualBatchIds: ["00000000-0000-0000-0000-000000000001"],
      triples: [{ plant: "DUB", costCenter: "Primary", glCode: "5001" }],
      plants: ["DUB"],
      from: "2026-04-01",
      to: "2026-07-01",
    },
    2,
    100,
  );

  const where = (sql: string) => sql.match(/WHERE ([\s\S]+?)\n(?:ORDER BY|LIMIT)/)?.[1];
  assert.equal(where(queries.pageSql), where(queries.footerSql));
  assert.match(
    queries.pageSql,
    /ORDER BY \(txn\.debit - txn\.credit\) DESC, txn\.month DESC, txn\.posting_date DESC, txn\.txn_no, txn\.line_id\nLIMIT 100 OFFSET 100$/,
  );
  assert.equal(new SqlValidator().validate(queries.pageSql, queries.objectsTouched, 1000).ok, true);
  assert.equal(new SqlValidator().validate(queries.footerSql, queries.objectsTouched, 1000).ok, true);

  await repository.execute(queries);
  assert.deepEqual(warehouse.explained, [queries.pageSql, queries.footerSql]);
  assert.deepEqual(warehouse.executed, [queries.pageSql, queries.footerSql]);
});

test("drill line dates are normalized to date only strings under a non utc timezone", () => {
  const original = process.env.TZ;
  process.env.TZ = "Asia/Kolkata";
  try {
    const adapterValue = new Date(2026, 6, 1).toISOString();
    assert.equal(adapterValue.startsWith("2026-06-30"), true);
    assert.equal(normalizeDateOnly(adapterValue), "2026-07-01");
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test("the repository honours the supplied row limit so twenty reaches the sql and the drill keeps one hundred", () => {
  const repository = new DrillTransactionsRepository(new SqlValidator(), new FakeWarehouse());
  assert.equal(repository.buildQueries.length, 3);
  const predicate = {
    actualBatchIds: ["00000000-0000-0000-0000-000000000001"],
    triples: [{ plant: "DUB", costCenter: "Primary", glCode: "5001" }],
    plants: ["DUB"],
    from: "2026-07-01",
    to: "2026-07-01",
  };
  assert.match(repository.buildQueries(predicate, 1, 20).pageSql, /LIMIT 20 OFFSET 0$/);
  assert.match(repository.buildQueries(predicate, 2, 100).pageSql, /LIMIT 100 OFFSET 100$/);
});

test("the repository returns each transaction's document number cost centre and account name", async () => {
  const warehouse = new FakeWarehouse([
    {
      month: "2026-07-01",
      posting_date: "2026-07-14",
      txn_no: "1900001234",
      cost_center: "DUB-NUR",
      acct_name: "Sprout Cost - Imp",
      debit: "125.00",
      credit: "0.00",
      value: "125.00",
      reference: "REF-1",
      memo: "Seedlings",
    },
  ]);
  const repository = new DrillTransactionsRepository(new SqlValidator(), warehouse);
  const queries = repository.buildQueries(
    {
      actualBatchIds: ["00000000-0000-0000-0000-000000000001"],
      triples: [{ plant: "DUB", costCenter: "DUB-NUR", glCode: "5001" }],
      plants: ["DUB"],
      from: "2026-07-01",
      to: "2026-07-01",
    },
    1,
    100,
  );

  assert.match(queries.pageSql, /txn\.txn_no/);
  assert.match(queries.pageSql, /txn\.cost_center/);
  assert.match(queries.pageSql, /txn\.acct_name/);
  assert.deepEqual((await repository.execute(queries)).lines, [
    {
      month: "2026-07-01",
      postingDate: "2026-07-14",
      txnNo: "1900001234",
      costCenter: "DUB-NUR",
      accountName: "Sprout Cost - Imp",
      debit: "125.00",
      credit: "0.00",
      value: "125.00",
      reference: "REF-1",
      memo: "Seedlings",
    },
  ]);
});

test("the repository keeps line and footer money exact through an adapter that coerces numeric decimals", async () => {
  const repository = new DrillTransactionsRepository(new SqlValidator(), new NumericCoercingWarehouse());
  const result = await repository.execute(
    repository.buildQueries(
      {
        actualBatchIds: ["00000000-0000-0000-0000-000000000001"],
        triples: [{ plant: "DUB", costCenter: "DUB-NUR", glCode: "5001" }],
        plants: ["DUB"],
        from: "2026-07-01",
        to: "2026-07-01",
      },
      1,
      100,
    ),
  );

  assert.deepEqual(
    {
      line: result.lines[0] && {
        debit: result.lines[0].debit,
        credit: result.lines[0].credit,
        value: result.lines[0].value,
      },
      footer: result.footer,
    },
    {
      line: { debit: "90000000000000.01", credit: "0.00", value: "90000000000000.01" },
      footer: { debit: "90000000000000.01", credit: "0.00", value: "90000000000000.01" },
    },
  );
});

test("pinned batch existence and active state are read in one query", async () => {
  const warehouse = new FakeWarehouse();
  const repository = new DrillTransactionsRepository(new SqlValidator(), warehouse);
  await repository.findBatchStates([
    { source: "actuals", period: "2026-07-01", batchId: "00000000-0000-0000-0000-000000000001" },
  ]);
  assert.equal(warehouse.executed.length, 1);
  assert.match(warehouse.executed[0]!, /id IN/);
  assert.match(warehouse.executed[0]!, /is_active/);
});

test("a GL-and-plants predicate keeps the answer's plants and row GL in both page and all-match footer", () => {
  const repository = new DrillTransactionsRepository(new SqlValidator(), new FakeWarehouse());
  const queries = repository.buildQueries(
    {
      mode: "gl-and-plants",
      actualBatchIds: ["00000000-0000-0000-0000-000000000001"],
      glCode: "50001201",
      plants: ["DUB"],
      filters: [{ dimensionId: "gl_code", op: "in", value: ["50001201", "50001202"] }],
      from: "2026-07-01",
      to: "2026-07-01",
    },
    1,
    100,
  );

  for (const sql of [queries.pageSql, queries.footerSql]) {
    assert.match(sql, /txn\.gl_code = '50001201'/);
    assert.match(sql, /txn\.plant IN \('DUB'\)/);
    assert.match(sql, /txn\.gl_code IN \('50001201', '50001202'\)/);
    assert.match(sql, /batch\.source_kind = 'actuals'/);
  }
});

test("a GL-and-plants predicate mirrors every answer-query filter operator and value-shape combination", () => {
  const repository = new DrillTransactionsRepository(new SqlValidator(), new FakeWarehouse());
  const builder = new SqlBuilder();
  const domain = new SemanticLayer().domain("governed-financial")!;
  const cases: Array<Pick<SelectionFilter, "op" | "value"> & { expected: string | null }> = [
    { op: "eq", value: "2026-06-01", expected: "month = '2026-06-01'" },
    { op: "eq", value: ["2026-06-01"], expected: null },
    { op: "neq", value: "2026-06-01", expected: "month <> '2026-06-01'" },
    { op: "neq", value: ["2026-06-01"], expected: null },
    { op: "in", value: "2026-06-01", expected: "month = '2026-06-01'" },
    {
      op: "in",
      value: ["2026-06-01", "2026-06-02"],
      expected: "month IN ('2026-06-01', '2026-06-02')",
    },
  ];

  for (const example of cases) {
    const filter: SelectionFilter = { dimensionId: "month", ...example };
    const answerSql = builder.build(
      domain,
      {
        domain: domain.name,
        measureIds: ["governed-financial.actual"],
        dimensionIds: ["gl_code"],
        filters: [filter],
        timeWindow: { grain: "month", column: "month", from: "2026-07-01", to: "2026-07-01" },
      },
      filterUser,
    ).sql;
    const { pageSql } = repository.buildQueries(
      {
        mode: "gl-and-plants",
        actualBatchIds: ["00000000-0000-0000-0000-000000000001"],
        glCode: "50001201",
        plants: ["DUB"],
        filters: [filter],
        from: "2026-07-01",
        to: "2026-07-01",
      },
      1,
      100,
    );
    const label = `${example.op} with ${Array.isArray(example.value) ? "array" : "string"} value`;
    if (example.expected) {
      assert.ok(answerSql.includes(example.expected), `answer ${label}`);
      assert.ok(pageSql.includes(`txn.${example.expected}`), `drill ${label}`);
    } else {
      assert.doesNotMatch(answerSql, /2026-06-01/, `answer ${label}`);
      assert.doesNotMatch(pageSql, /2026-06-01/, `drill ${label}`);
    }
  }
});

test("summaries expose feeding-line counts and the exact debit-minus-credit decimal string for issuance", async () => {
  const warehouse = new FakeWarehouse(
    [],
    [
      { row_key: "50001201", feeding_line_count: "2", value: "8398339.00" },
      { row_key: "zero-net", feeding_line_count: "2", value: "0.00" },
    ],
  );
  const repository = new DrillTransactionsRepository(new SqlValidator(), warehouse);
  const summaries = await repository.summarize([
    {
      rowKey: "50001201",
      predicate: {
        mode: "gl-and-plants",
        actualBatchIds: ["00000000-0000-0000-0000-000000000001"],
        glCode: "50001201",
        plants: ["DUB"],
        filters: [],
        from: "2026-07-01",
        to: "2026-07-01",
      },
    },
    {
      rowKey: "zero-net",
      predicate: {
        mode: "triples",
        actualBatchIds: ["00000000-0000-0000-0000-000000000001"],
        triples: [{ plant: "DUB", costCenter: "NURSERY", glCode: "50009999" }],
        plants: ["DUB"],
        from: "2026-07-01",
        to: "2026-07-01",
      },
    },
  ]);

  assert.deepEqual(summaries, [
    { rowKey: "50001201", feedingLineCount: 2, value: "8398339.00" },
    { rowKey: "zero-net", feedingLineCount: 2, value: "0.00" },
  ]);
  assert.match(warehouse.executed[0]!, /SUM\(txn\.debit - txn\.credit\)::text AS value/);
  assert.match(warehouse.executed[0]!, /^\(SELECT[\s\S]+\nUNION ALL\n\(SELECT/);
});

test("a summary of the default maximum one thousand row keys passes validation with that exact bound", async () => {
  const original = process.env.MAX_ROWS;
  delete process.env.MAX_ROWS;
  try {
    const warehouse = new FakeWarehouse();
    await new DrillTransactionsRepository(new SqlValidator(), warehouse).summarize(summaryInputs(1_000));
    assert.equal(warehouse.executed.length, 1);
    assert.match(warehouse.executed[0]!, /LIMIT 1000$/);
  } finally {
    if (original === undefined) delete process.env.MAX_ROWS;
    else process.env.MAX_ROWS = original;
  }
});

test("a summary above the configured maximum batches every row key into validator-safe queries", async () => {
  const original = process.env.MAX_ROWS;
  delete process.env.MAX_ROWS;
  try {
    const warehouse = new FakeWarehouse();
    await new DrillTransactionsRepository(new SqlValidator(), warehouse).summarize(summaryInputs(1_001));
    assert.equal(warehouse.executed.length, 2);
    assert.match(warehouse.executed[0]!, /LIMIT 1000$/);
    assert.match(warehouse.executed[1]!, /LIMIT 1$/);
  } finally {
    if (original === undefined) delete process.env.MAX_ROWS;
    else process.env.MAX_ROWS = original;
  }
});

function summaryInputs(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    rowKey: `row-${index}`,
    predicate: {
      mode: "gl-and-plants" as const,
      actualBatchIds: ["00000000-0000-0000-0000-000000000001"],
      glCode: `5000${index}`,
      plants: ["DUB"],
      filters: [],
      from: "2026-07-01",
      to: "2026-07-01",
    },
  }));
}

const filterUser: AuthUser = {
  id: "user-1",
  email: "finance@example.com",
  display_name: "Finance",
  is_active: true,
  roles: ["admin"],
  permissions: {
    actions: ["report"],
    domains: ["governed-financial"],
    measureIds: ["governed-financial.actual"],
    dimensionIds: ["gl_code", "month"],
  },
  scope: [{ attribute: "plant", value: "DUB" }],
};

class FakeWarehouse implements Warehouse {
  explained: string[] = [];
  executed: string[] = [];

  constructor(
    private readonly pageRows: Array<Record<string, string | number | null>> = [],
    private readonly summaryRows: Array<Record<string, string | number | null>> = [],
  ) {}

  async explain(sql: string) {
    this.explained.push(sql);
  }

  async execute(sql: string) {
    this.executed.push(sql);
    if (sql.includes("feeding_line_count")) return { columns: [], rows: this.summaryRows };
    return sql.includes("COUNT(*)")
      ? { columns: [], rows: [{ total_count: "0", debit: "0.00", credit: "0.00", value: "0.00" }] }
      : { columns: [], rows: this.pageRows };
  }

  async freshness() {
    return null;
  }
  async distinctValues() {
    return [];
  }
}

class NumericCoercingWarehouse implements Warehouse {
  async explain() {}

  async execute(sql: string) {
    const cell = (alias: "debit" | "credit" | "value", value: string) =>
      toStarRocksMysqlCell(value, !new RegExp(`::text AS ${alias}(?:,|\\n)`).test(sql));
    if (sql.includes("COUNT(*)")) {
      return {
        columns: [],
        rows: [
          {
            total_count: 1,
            debit: cell("debit", "90000000000000.01"),
            credit: cell("credit", "0.00"),
            value: cell("value", "90000000000000.01"),
          },
        ],
      };
    }
    return {
      columns: [],
      rows: [
        {
          month: "2026-07-01",
          posting_date: "2026-07-14",
          txn_no: "1900001234",
          cost_center: "DUB-NUR",
          acct_name: "Sprout Cost - Imp",
          debit: cell("debit", "90000000000000.01"),
          credit: cell("credit", "0.00"),
          value: cell("value", "90000000000000.01"),
          reference: null,
          memo: null,
        },
      ],
    };
  }

  async freshness() {
    return null;
  }

  async distinctValues() {
    return [];
  }
}
