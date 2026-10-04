import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser, SelectionFilter } from "@3f/contract";
import { SemanticLayer } from "../semantic/semanticLayer";
import { SqlBuilder } from "../sql/sqlBuilder";
import { SqlValidator } from "../sql/sqlValidator";
import type { Warehouse } from "./warehouse.interface";
import { GlNameRepository } from "./gl-name.repository";
import { buildDrillPredicate, DrillTransactionsRepository, normalizeDateOnly } from "./drill-transactions.repository";
import { StarRocksMysqlAdapter } from "./starrocks-mysql.adapter";

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

test("the configured StarRocks adapter preserves exact page, footer, and summary money cast as text", async () => {
  await withStarRocksAdapter(253, async (adapter, receivedSql) => {
    const repository = new DrillTransactionsRepository(new SqlValidator(), adapter);
    const predicate = {
      actualBatchIds: ["00000000-0000-0000-0000-000000000001"],
      triples: [{ plant: "DUB", costCenter: "DUB-NUR", glCode: "5001" }],
      plants: ["DUB"],
      from: "2026-07-01",
      to: "2026-07-01",
    };
    const result = await repository.execute(repository.buildQueries(predicate, 1, 100));
    const summaries = await repository.summarize([{ rowKey: "5001", predicate }]);

    assert.deepEqual(
      {
        line: result.lines[0] && {
          debit: result.lines[0].debit,
          credit: result.lines[0].credit,
          value: result.lines[0].value,
        },
        footer: result.footer,
        summary: summaries[0]?.value,
      },
      {
        line: { debit: EXACT_MONEY, credit: "0.00", value: EXACT_MONEY },
        footer: { debit: EXACT_MONEY, credit: "0.00", value: EXACT_MONEY },
        summary: EXACT_MONEY,
      },
    );

    const executed = receivedSql.filter((sql) => !sql.startsWith("EXPLAIN "));
    const pageSql = executed.find((sql) => sql.includes("OFFSET 0"))!;
    const footerSql = executed.find((sql) => sql.includes("total_count"))!;
    const summarySql = executed.find((sql) => sql.includes("feeding_line_count"))!;
    assert.match(pageSql, /txn\.debit::text AS debit/);
    assert.match(pageSql, /txn\.credit::text AS credit/);
    assert.match(pageSql, /\(txn\.debit - txn\.credit\)::numeric\(18,2\)::text AS value/);
    assert.match(footerSql, /SUM\(txn\.debit\)[\s\S]+::text AS debit/);
    assert.match(footerSql, /SUM\(txn\.credit\)[\s\S]+::text AS credit/);
    assert.match(footerSql, /SUM\(txn\.debit - txn\.credit\)[\s\S]+::text AS value/);
    assert.match(summarySql, /SUM\(txn\.debit - txn\.credit\)::text AS value/);
  });
});

test("the configured StarRocks adapter rounds an uncast NEWDECIMAL above the safe integer range", async () => {
  await withStarRocksAdapter(246, async (adapter) => {
    const result = await adapter.execute("SELECT uncast_decimal_outputs");
    assert.equal(typeof result.rows[0]?.value, "number");
    assert.equal(String(result.rows[0]?.value), "90000000000000.02");
    assert.notEqual(String(result.rows[0]?.value), EXACT_MONEY);
  });
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

test("active Actual pins are read for the inclusive window in period order and converted from warehouse rows", async () => {
  const warehouse = new FakeWarehouse([
    {
      id: "00000000-0000-0000-0000-000000000004",
      source_kind: "actuals",
      period: "2026-04-01T00:00:00.000Z",
      is_active: 1,
    },
    {
      id: "00000000-0000-0000-0000-000000000007",
      source_kind: "actuals",
      period: "2026-07-01",
      is_active: 1,
    },
  ]);
  const pins = await new DrillTransactionsRepository(new SqlValidator(), warehouse).findActiveActualPins(
    "2026-04-01",
    "2026-07-31",
  );

  assert.deepEqual(pins, [
    { source: "actuals", period: "2026-04-01", batchId: "00000000-0000-0000-0000-000000000004" },
    { source: "actuals", period: "2026-07-01", batchId: "00000000-0000-0000-0000-000000000007" },
  ]);
  assert.equal(warehouse.executed.length, 1);
  assert.match(warehouse.executed[0]!, /source_kind = 'actuals'/);
  assert.match(warehouse.executed[0]!, /AND is_active/);
  assert.match(warehouse.executed[0]!, /period >= '2026-04-01'/);
  assert.match(warehouse.executed[0]!, /period <= '2026-07-31'/);
  assert.match(warehouse.executed[0]!, /ORDER BY period/);
});

test("active Budget periods are read once for an inclusive range", async () => {
  const warehouse = new FakeWarehouse([{ period: "2026-04-01T00:00:00.000Z" }, { period: "2026-07-01" }]);

  const periods = await new DrillTransactionsRepository(new SqlValidator(), warehouse).findActiveBudgetPeriods(
    "2016-01-01",
    "2026-07-31",
  );

  assert.deepEqual(periods, ["2026-04-01", "2026-07-01"]);
  assert.equal(warehouse.executed.length, 1);
  assert.match(warehouse.executed[0]!, /SELECT DISTINCT period/);
  assert.match(warehouse.executed[0]!, /source_kind = 'budget'/);
  assert.match(warehouse.executed[0]!, /AND is_active/);
  assert.match(warehouse.executed[0]!, /period >= '2016-01-01'/);
  assert.match(warehouse.executed[0]!, /period <= '2026-07-31'/);
  assert.match(warehouse.executed[0]!, /ORDER BY period/);
  assert.match(warehouse.executed[0]!, /LIMIT 25000/);
});

test("each GL row's plant set independently scopes its predicate, page, footer, and summary", async () => {
  const cases = [
    { plants: ["CHIR"], plantClause: "txn.plant IN ('CHIR')" },
    { plants: ["DUB"], plantClause: "txn.plant IN ('DUB')" },
    { plants: ["CHIR", "DUB"], plantClause: "txn.plant IN ('CHIR', 'DUB')" },
  ];

  for (const example of cases) {
    const warehouse = new FakeWarehouse();
    const repository = new DrillTransactionsRepository(new SqlValidator(), warehouse);
    const predicate = {
      mode: "gl-and-plants" as const,
      actualBatchIds: ["00000000-0000-0000-0000-000000000001"],
      glCode: "50001201",
      plants: example.plants,
      filters: [{ dimensionId: "gl_code", op: "in" as const, value: ["50001201", "50001202"] }],
      from: "2026-07-01",
      to: "2026-07-01",
    };
    const queries = repository.buildQueries(predicate, 1, 100);
    await repository.summarize([{ rowKey: example.plants.join("+"), predicate }]);

    for (const sql of [buildDrillPredicate(predicate), queries.pageSql, queries.footerSql, warehouse.executed[0]!]) {
      assert.deepEqual(sql.match(/txn\.plant IN \([^)]*\)/g), [example.plantClause]);
      assert.match(sql, /txn\.gl_code = '50001201'/);
      assert.match(sql, /txn\.gl_code IN \('50001201', '50001202'\)/);
      assert.match(sql, /batch\.source_kind = 'actuals'/);
    }
  }
});

test("each statement row predicate keeps that plant's own triples in its page, footer, and summary", async () => {
  const cases = [
    { plant: "CHIR", costCenter: "CHIR-NUR", otherPlant: "DUB" },
    { plant: "DUB", costCenter: "DUB-NUR", otherPlant: "CHIR" },
  ];

  for (const example of cases) {
    const warehouse = new FakeWarehouse();
    const repository = new DrillTransactionsRepository(new SqlValidator(), warehouse);
    const predicate = {
      mode: "triples" as const,
      actualBatchIds: ["00000000-0000-0000-0000-000000000001"],
      triples: [{ plant: example.plant, costCenter: example.costCenter, glCode: "50001201" }],
      plants: [example.plant],
      from: "2026-07-01",
      to: "2026-07-01",
    };
    const queries = repository.buildQueries(predicate, 1, 100);
    await repository.summarize([{ rowKey: example.plant, predicate }]);
    const ownTriple = `(txn.plant = '${example.plant}' AND txn.cost_center = '${example.costCenter}' AND txn.gl_code = '50001201')`;

    for (const sql of [buildDrillPredicate(predicate), queries.pageSql, queries.footerSql, warehouse.executed[0]!]) {
      assert.deepEqual(sql.match(/txn\.plant IN \([^)]*\)/g), [`txn.plant IN ('${example.plant}')`]);
      assert.ok(sql.includes(ownTriple));
      assert.ok(!sql.includes(`txn.plant = '${example.otherPlant}'`));
    }
  }
});

test("the drill and name resolver use the identical predicate for the same answer scope", async () => {
  const predicate = {
    mode: "gl-and-plants" as const,
    actualBatchIds: ["00000000-0000-0000-0000-000000000001"],
    glCode: "50001201",
    plants: ["DUB"],
    filters: [{ dimensionId: "month", op: "neq" as const, value: "2026-06-01" }],
    from: "2026-07-01",
    to: "2026-07-31",
  };
  const warehouse = new FakeWarehouse();
  const names = new GlNameRepository(new SqlValidator(), warehouse, {
    findByBudgetPeriod: async () => [],
    findByBudgetBatchId: async () => [],
  });

  await names.findGlCodeLabels([{ key: predicate.glCode, predicate }]);
  const drillSql = new DrillTransactionsRepository(new SqlValidator(), warehouse).buildQueries(
    predicate,
    1,
    100,
  ).pageSql;
  const drillWhere = drillSql.match(/WHERE ([\s\S]+?)\nORDER BY/)?.[1];
  const expected = buildDrillPredicate(predicate);
  const nameSql = warehouse.executed[0] ?? "";

  assert.equal(drillWhere, expected);
  assert.equal(nameSql.split(`WHERE (${expected})`).length - 1, 1);
  assert.equal(nameSql.match(/FROM sap_transaction/g)?.length, 1);
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
    if (sql.includes("scoped_line_count")) {
      return {
        columns: [],
        rows: [
          {
            row_ordinal: "0",
            row_key: "50001201",
            scoped_line_count: "0",
            name_groups: "[]",
          },
        ],
      };
    }
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

const EXACT_MONEY = "90000000000000.01";
const VAR_STRING = 253;

type MysqlFieldFixture = { name: string; type: number };
type InjectedPool = {
  query(options: { sql: string }): Promise<[Array<Record<string, string | null>>, MysqlFieldFixture[]]>;
};

async function withStarRocksAdapter(
  moneyFieldType: number,
  run: (adapter: StarRocksMysqlAdapter, receivedSql: string[]) => Promise<void>,
): Promise<void> {
  const originalHost = process.env.STARROCKS_HOST;
  const originalCatalog = process.env.STARROCKS_CATALOG;
  process.env.STARROCKS_HOST = "starrocks.test";
  process.env.STARROCKS_CATALOG = "default_catalog";
  try {
    const receivedSql: string[] = [];
    const adapter = new StarRocksMysqlAdapter();
    const pool: InjectedPool = {
      async query({ sql }) {
        receivedSql.push(sql);
        return mysqlResult(sql, moneyFieldType);
      },
    };
    (adapter as unknown as { pool: InjectedPool }).pool = pool;
    await run(adapter, receivedSql);
  } finally {
    if (originalHost === undefined) delete process.env.STARROCKS_HOST;
    else process.env.STARROCKS_HOST = originalHost;
    if (originalCatalog === undefined) delete process.env.STARROCKS_CATALOG;
    else process.env.STARROCKS_CATALOG = originalCatalog;
  }
}

function mysqlResult(sql: string, moneyFieldType: number): [Array<Record<string, string | null>>, MysqlFieldFixture[]] {
  if (sql.startsWith("EXPLAIN ")) return [[], []];
  if (sql.includes("feeding_line_count")) {
    return [
      [{ row_key: "5001", feeding_line_count: "1", value: EXACT_MONEY }],
      [
        { name: "row_key", type: VAR_STRING },
        { name: "feeding_line_count", type: 8 },
        { name: "value", type: moneyFieldType },
      ],
    ];
  }
  if (sql.includes("total_count")) {
    return [
      [{ total_count: "1", debit: EXACT_MONEY, credit: "0.00", value: EXACT_MONEY }],
      [
        { name: "total_count", type: 8 },
        { name: "debit", type: moneyFieldType },
        { name: "credit", type: moneyFieldType },
        { name: "value", type: moneyFieldType },
      ],
    ];
  }
  return [
    [
      {
        month: "2026-07-01",
        posting_date: "2026-07-14",
        txn_no: "1900001234",
        cost_center: "DUB-NUR",
        acct_name: "Sprout Cost - Imp",
        debit: EXACT_MONEY,
        credit: "0.00",
        value: EXACT_MONEY,
        reference: null,
        memo: null,
      },
    ],
    [
      { name: "month", type: VAR_STRING },
      { name: "posting_date", type: VAR_STRING },
      { name: "txn_no", type: VAR_STRING },
      { name: "cost_center", type: VAR_STRING },
      { name: "acct_name", type: VAR_STRING },
      { name: "debit", type: moneyFieldType },
      { name: "credit", type: moneyFieldType },
      { name: "value", type: moneyFieldType },
      { name: "reference", type: VAR_STRING },
      { name: "memo", type: VAR_STRING },
    ],
  ];
}
