import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpException } from "@nestjs/common";
import type { AuthUser, ProvenanceBatch } from "@3f/contract";
import { SqlValidator } from "../sql/sqlValidator";
import type { DrillPredicate } from "../warehouse/drill-transactions.interface";
import { DrillTransactionsRepository } from "../warehouse/drill-transactions.repository";
import type { Warehouse } from "../warehouse/warehouse.interface";
import { AskDrillContextService, type AskDrillContextInput } from "./ask-drill-context";
import { AskDrillController } from "./ask-drill.controller";
import { AskDrillService } from "./ask-drill.service";

const actualPin: ProvenanceBatch = {
  source: "actuals",
  period: "2026-07-01",
  batchId: "00000000-0000-0000-0000-000000000001",
};
const budgetPin: ProvenanceBatch = {
  source: "budget",
  period: "2026-07-01",
  batchId: "00000000-0000-0000-0000-000000000002",
};
const input: AskDrillContextInput = {
  userId: "user-1",
  selection: {
    domain: "governed-financial",
    measureIds: ["governed-financial.actual"],
    dimensionIds: ["gl_code"],
    filters: [],
    timeWindow: { grain: "month", column: "month", from: "2026-07-01", to: "2026-07-01" },
  },
  plants: ["DUB"],
  pinnedActuals: [actualPin],
  rows: [{ key: "50001201", actualPaise: "839833900", drillable: true }],
};

test("the signed Ask route re-derives a GL-and-answer-plants predicate and foots the page to the signed Actual", async () => {
  const events: string[] = [];
  const predicate: DrillPredicate = {
    mode: "gl-and-plants",
    actualBatchIds: [actualPin.batchId],
    glCode: "50001201",
    plants: ["DUB"],
    filters: [],
    from: "2026-07-01",
    to: "2026-07-01",
  };
  const warehouse = new FixtureWarehouse(events, predicate);
  const repository = new DrillTransactionsRepository(new SqlValidator(), warehouse);
  const [summary] = await repository.summarize([{ rowKey: "50001201", predicate }]);
  assert.ok(summary);
  const contexts = new AskDrillContextService(["secret"], 30, () => 1_000_000);
  const audit = new FakeAudit(events);
  const controller = new AskDrillController(new AskDrillService(contexts, repository, audit));
  const context = contexts.issue({
    ...input,
    rows: [{ key: "50001201", actualPaise: toPaise(summary.value), drillable: summary.feedingLineCount > 0 }],
  });
  events.length = 0;
  const response = await controller.run(
    { ...user, scope: [...user.scope, { attribute: "plant", value: "H.O" }] },
    "session-1",
    { context, rowKey: "50001201", page: 1 },
  );

  assert.equal(response.footer.value, summary.value);
  assert.deepEqual(
    { page: response.page, pageSize: response.pageSize, totalCount: response.totalCount },
    { page: 1, pageSize: 100, totalCount: 3 },
  );
  assert.deepEqual(
    response.lines.map(({ txnNo, value }) => ({ txnNo, value })),
    [
      { txnNo: "inside-rupees", value: "12345.67" },
      { txnNo: "inside-paisa", value: "0.01" },
      { txnNo: "inside-credit", value: "-45.67" },
    ],
  );
  const pageSql = warehouse.executed.find((sql) => sql.includes("ORDER BY (txn.debit - txn.credit)"))!;
  assert.match(pageSql, /txn\.gl_code = '50001201'/);
  assert.match(pageSql, /txn\.plant IN \('DUB'\)/);
  assert.doesNotMatch(pageSql, /H\.O/);
  assert.ok(events.indexOf("audit-request") < events.indexOf("transaction-read"));
  assert.equal(audit.requests[0]?.questionLabel, "Ask transaction drill");
});

test("the signed Ask route ignores the unknown and empty-array filters that the answer query ignores", async () => {
  const warehouse = new FakeWarehouse([], {
    batches: [batch(actualPin, true)],
    pageRows: [transaction("8398339.00")],
    footer: { total_count: "1", debit: "8398339.00", credit: "0.00", value: "8398339.00" },
  });
  const { controller, contexts } = harness(warehouse, []);
  const context = contexts.issue({
    ...input,
    selection: {
      ...input.selection,
      filters: [
        { dimensionId: "unknown", op: "eq", value: "ignored" },
        { dimensionId: "month", op: "eq", value: [] },
        { dimensionId: "gl_code", op: "neq", value: [] },
      ],
    },
  });

  const response = await controller.run(user, "session-1", { context, rowKey: "50001201", page: 1 });

  assert.equal(response.footer.value, "8398339.00");
  const pageSql = warehouse.executed.find((sql) => sql.includes("ORDER BY (txn.debit - txn.credit)"))!;
  assert.doesNotMatch(pageSql, /unknown|ignored|IN \(\)/);
});

test("the route compares exact paise for one paisa, a normal cent value, and an amount above ninety lakh crore", async () => {
  for (const [actualPaise, decimal] of [
    ["1", "0.01"],
    ["1234567", "12345.67"],
    ["9000000000000001", "90000000000000.01"],
  ] as const) {
    const warehouse = new FakeWarehouse([], {
      batches: [batch(actualPin, true)],
      footer: { total_count: "1", debit: decimal, credit: "0.00", value: decimal },
    });
    const { controller, contexts } = harness(warehouse, []);
    const response = await controller.run(user, "session-1", {
      context: contexts.issue({ ...input, rows: [{ ...input.rows[0]!, actualPaise }] }),
      rowKey: "50001201",
      page: 1,
    });
    assert.equal(response.footer.value, decimal);
  }
});

test("a footer that does not equal the signed Actual is refused and recorded instead of returning partial rows", async () => {
  const events: string[] = [];
  const warehouse = new FakeWarehouse(events, {
    batches: [batch(actualPin, true)],
    pageRows: [transaction("1.00")],
    footer: { total_count: "1", debit: "1.00", credit: "0.00", value: "1.00" },
  });
  const { service, contexts, audit } = harness(warehouse, events);
  const outcome = await service.run(user, "session-1", {
    context: contexts.issue(input),
    rowKey: "50001201",
    page: 1,
  });

  assert.equal(outcome.outcome, "refused");
  assert.equal(audit.refusals.length, 1);
});

test("the Ask route rejects non-integer, zero, and excessive pages as 400 before the service", async () => {
  const { controller, contexts } = harness(new FakeWarehouse([]), []);
  for (const page of [0, 1.5, 1_000_001]) {
    await assert.rejects(
      () => controller.run(user, "session-1", { context: contexts.issue(input), rowKey: "50001201", page }),
      (error: unknown) => error instanceof HttpException && error.getStatus() === 400,
    );
  }
});

test("tampering, expiry, another user, an unlisted row, and every changed-access case return their exact refusal", async () => {
  let now = 1_000_000;
  const events: string[] = [];
  const warehouse = new FakeWarehouse(events, { batches: [batch(actualPin, true)] });
  const contexts = new AskDrillContextService(["secret"], 1, () => now);
  const audit = new FakeAudit(events);
  const service = new AskDrillService(contexts, new DrillTransactionsRepository(new SqlValidator(), warehouse), audit);
  const controller = new AskDrillController(service);
  const valid = contexts.issue({ ...input, plants: ["DUB", "H.O"] });
  const cases: Array<{
    name: string;
    context: string;
    actor: AuthUser;
    rowKey: string;
    status: number;
    message: string;
  }> = [
    {
      name: "tampered",
      context: `${valid.slice(0, -1)}x`,
      actor: user,
      rowKey: "50001201",
      status: 403,
      message: "This answer link is invalid. Ask again to open its transactions.",
    },
    {
      name: "other user",
      context: valid,
      actor: { ...user, id: "user-2" },
      rowKey: "50001201",
      status: 403,
      message: "Your access has changed since this answer was shown. Ask again.",
    },
    {
      name: "unlisted row",
      context: contexts.issue(input),
      actor: user,
      rowKey: "forged",
      status: 400,
      message: "This answer does not include that row. Ask again.",
    },
    {
      name: "lost one plant",
      context: valid,
      actor: user,
      rowKey: "50001201",
      status: 403,
      message: "Your access has changed since this answer was shown. Ask again.",
    },
    {
      name: "lost Actual",
      context: contexts.issue(input),
      actor: { ...user, permissions: { ...user.permissions, measureIds: [] } },
      rowKey: "50001201",
      status: 403,
      message: "Your access has changed since this answer was shown. Ask again.",
    },
    {
      name: "lost domain",
      context: contexts.issue(input),
      actor: { ...user, permissions: { ...user.permissions, domains: [] } },
      rowKey: "50001201",
      status: 403,
      message: "Your access has changed since this answer was shown. Ask again.",
    },
  ];
  for (const example of cases) {
    await assert.rejects(
      () =>
        controller.run(example.actor, "session-1", {
          context: example.context,
          rowKey: example.rowKey,
          page: 1,
        }),
      (error: unknown) =>
        error instanceof HttpException && error.getStatus() === example.status && error.message === example.message,
      example.name,
    );
  }
  now = 1_061_000;
  await assert.rejects(
    () => controller.run(user, "session-1", { context: valid, rowKey: "50001201", page: 1 }),
    (error: unknown) =>
      error instanceof HttpException &&
      error.getStatus() === 410 &&
      error.message === "This answer is too old to open. Ask again to open its transactions.",
  );
  assert.equal(audit.refusals.length, cases.length + 1);
  assert.equal(events.includes("transaction-read"), false);
});

test("an audit failure returns 503 and no transaction query starts", async () => {
  const events: string[] = [];
  const warehouse = new FakeWarehouse(events, { batches: [batch(actualPin, true)] });
  const { controller, contexts, audit } = harness(warehouse, events);
  audit.failRequests = true;

  await assert.rejects(
    () =>
      controller.run(user, "session-1", {
        context: contexts.issue(input),
        rowKey: "50001201",
        page: 1,
      }),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 503,
  );
  assert.equal(events.includes("transaction-read"), false);
});

test("replaced actuals are read by pinned id and named, while gone actuals are refused with no rows", async () => {
  const replacement: ProvenanceBatch = { ...actualPin, batchId: "00000000-0000-0000-0000-000000000009" };
  const replacedWarehouse = new FakeWarehouse([], {
    batches: [batch(actualPin, false), batch(replacement, true)],
    pageRows: [transaction("8398339.00")],
    footer: { total_count: "1", debit: "8398339.00", credit: "0.00", value: "8398339.00" },
  });
  const replaced = harness(replacedWarehouse, []);
  const response = await replaced.controller.run(user, "session-1", {
    context: replaced.contexts.issue(input),
    rowKey: "50001201",
    page: 1,
  });
  assert.match(response.notice ?? "", /data that has since been reloaded/);
  assert.equal(response.batchStatuses[0]?.status, "replaced");
  assert.match(
    replacedWarehouse.executed.find((sql) => sql.includes("ORDER BY (txn.debit - txn.credit)"))!,
    new RegExp(actualPin.batchId),
  );

  const goneEvents: string[] = [];
  const goneWarehouse = new FakeWarehouse(goneEvents, { batches: [] });
  const gone = harness(goneWarehouse, goneEvents);
  await assert.rejects(
    () =>
      gone.controller.run(user, "session-1", {
        context: gone.contexts.issue(input),
        rowKey: "50001201",
        page: 1,
      }),
    (error: unknown) =>
      error instanceof HttpException &&
      error.getStatus() === 409 &&
      error.message === "The data behind this answer is no longer available. Ask again to open its transactions.",
  );
  assert.equal(
    goneWarehouse.executed.some((sql) => sql.includes("FROM sap_transaction")),
    false,
  );
  assert.equal(gone.audit.refusals.length, 1);
});

test("statement rows use only signed triples and bind replaced or gone budget pins without gating on mapping version", async () => {
  const replacement: ProvenanceBatch = { ...budgetPin, batchId: "00000000-0000-0000-0000-000000000008" };
  const statement: AskDrillContextInput = {
    ...input,
    selection: {
      ...input.selection,
      domain: "mis-statement",
      measureIds: ["mis-statement.actual_net"],
      dimensionIds: ["leaf_key"],
    },
    budget: { pin: budgetPin, outlineDigest: "original-outline" },
    mappingMasterVersion: 999,
    rows: [
      {
        key: "1.1|50001201|sprout-cost",
        actualPaise: "839833900",
        drillable: true,
        triples: [{ plant: "DUB", costCenter: "NURSERY", glCode: "50001201" }],
      },
    ],
  };
  const statementUser = {
    ...user,
    permissions: {
      ...user.permissions,
      domains: ["mis-statement"],
      measureIds: ["mis-statement.actual_net"],
      dimensionIds: ["leaf_key"],
    },
  };
  const replacedWarehouse = new FakeWarehouse([], {
    batches: [batch(actualPin, true), batch(budgetPin, false), batch(replacement, true)],
    pageRows: [transaction("8398339.00")],
    footer: { total_count: "1", debit: "8398339.00", credit: "0.00", value: "8398339.00" },
  });
  const replaced = harness(replacedWarehouse, []);
  const response = await replaced.controller.run(statementUser, "session-1", {
    context: replaced.contexts.issue(statement),
    rowKey: statement.rows[0]!.key,
    page: 1,
  });
  assert.equal(response.batchStatuses.find(({ source }) => source === "budget")?.status, "replaced");
  assert.equal(
    response.notice,
    "This answer was built on data that has since been reloaded; these are the lines it was built from.",
  );
  assert.match(
    replacedWarehouse.executed.find((sql) => sql.includes("ORDER BY (txn.debit - txn.credit)"))!,
    /txn\.cost_center = 'NURSERY'/,
  );

  const actualOnly = harness(
    new FakeWarehouse([], {
      batches: [batch(actualPin, true)],
      footer: { total_count: "0", debit: "0.00", credit: "0.00", value: "0.00" },
    }),
    [],
  );
  const emptyStatement = {
    ...statement,
    budget: undefined,
    rows: [{ ...statement.rows[0]!, actualPaise: "0" }],
  };
  const empty = await actualOnly.controller.run(statementUser, "session-1", {
    context: actualOnly.contexts.issue(emptyStatement),
    rowKey: statement.rows[0]!.key,
    page: 1,
  });
  assert.deepEqual(empty.lines, []);
  assert.equal(empty.footer.value, "0.00");

  const goneEvents: string[] = [];
  const goneWarehouse = new FakeWarehouse(goneEvents, { batches: [batch(actualPin, true)] });
  const gone = harness(goneWarehouse, goneEvents);
  await assert.rejects(
    () =>
      gone.controller.run(statementUser, "session-1", {
        context: gone.contexts.issue(statement),
        rowKey: statement.rows[0]!.key,
        page: 1,
      }),
    (error: unknown) =>
      error instanceof HttpException &&
      error.getStatus() === 409 &&
      error.message === "The data behind this answer is no longer available. Ask again to open its transactions.",
  );
  assert.equal(
    goneWarehouse.executed.some((sql) => sql.includes("FROM sap_transaction")),
    false,
  );
  assert.equal(gone.audit.refusals.length, 1);
});

function harness(warehouse: FakeWarehouse, events: string[]) {
  const contexts = new AskDrillContextService(["secret"], 30, () => 1_000_000);
  const audit = new FakeAudit(events);
  const service = new AskDrillService(contexts, new DrillTransactionsRepository(new SqlValidator(), warehouse), audit);
  return { controller: new AskDrillController(service), service, contexts, audit, warehouse };
}

class FakeAudit {
  requests: Array<Record<string, unknown>> = [];
  refusals: Array<Record<string, unknown>> = [];
  failRequests = false;

  constructor(private readonly events: string[]) {}

  async writeDrillEvent(event: Record<string, unknown>) {
    this.events.push("audit-request");
    if (this.failRequests) throw new Error("audit unavailable");
    this.requests.push(event);
    return 1;
  }

  async writeDrillRefusalEvent(event: Record<string, unknown>) {
    this.events.push("audit-refusal");
    this.refusals.push(event);
    return 1;
  }
}

const fixtureTransactions = [
  fixtureTransaction("inside-rupees", "12345.67", "0.00"),
  fixtureTransaction("inside-paisa", "0.01", "0.00"),
  fixtureTransaction("inside-credit", "0.00", "45.67"),
  fixtureTransaction("other-gl", "900.00", "0.00", { gl_code: "50001202" }),
  fixtureTransaction("outside-plant", "200.00", "0.00", { plant: "H.O" }),
  fixtureTransaction("outside-month", "300.00", "0.00", { month: "2026-06-01" }),
];

class FixtureWarehouse implements Warehouse {
  executed: string[] = [];

  constructor(
    private readonly events: string[],
    private readonly predicate: DrillPredicate,
  ) {}

  async explain() {}

  async execute(sql: string) {
    this.executed.push(sql);
    if (sql.includes("FROM ingest_batch") && sql.includes("id IN")) {
      return { columns: [], rows: [batch(actualPin, true)] };
    }
    if (sql.includes("SELECT DISTINCT period")) {
      return { columns: [], rows: [{ period: "2026-07-01" }] };
    }
    const rows = fixtureTransactions.filter((row) => matches(row, this.predicate));
    if (sql.includes("feeding_line_count")) {
      return {
        columns: [],
        rows: [
          {
            row_key: "50001201",
            feeding_line_count: String(rows.length),
            value: sum(rows, "debit") - sum(rows, "credit"),
          },
        ].map((row) => ({ ...row, value: formatPaise(row.value) })),
      };
    }
    if (sql.includes("COUNT(*)")) {
      this.events.push("transaction-read");
      const debit = sum(rows, "debit");
      const credit = sum(rows, "credit");
      return {
        columns: [],
        rows: [
          {
            total_count: String(rows.length),
            debit: formatPaise(debit),
            credit: formatPaise(credit),
            value: formatPaise(debit - credit),
          },
        ],
      };
    }
    if (sql.includes("FROM sap_transaction")) {
      this.events.push("transaction-read");
      return {
        columns: [],
        rows: [...rows]
          .sort((left, right) => Number(transactionValue(right) - transactionValue(left)))
          .map((row) => ({ ...row, value: formatPaise(transactionValue(row)) })),
      };
    }
    return { columns: [], rows: [] };
  }

  async freshness() {
    return null;
  }

  async distinctValues() {
    return [];
  }
}

class FakeWarehouse implements Warehouse {
  executed: string[] = [];
  private readonly config: {
    batches: Array<Record<string, string | number | null>>;
    pageRows: Array<Record<string, string | number | null>>;
    footer: Record<string, string | number | null>;
  };

  constructor(
    private readonly events: string[],
    config: Partial<FakeWarehouse["config"]> = {},
  ) {
    this.config = {
      batches: config.batches ?? [],
      pageRows: config.pageRows ?? [],
      footer: config.footer ?? { total_count: "0", debit: "0.00", credit: "0.00", value: "0.00" },
    };
  }

  async explain() {}

  async execute(sql: string) {
    this.executed.push(sql);
    if (sql.includes("FROM ingest_batch") && sql.includes("id IN")) return { columns: [], rows: this.config.batches };
    if (sql.includes("SELECT DISTINCT period")) return { columns: [], rows: [{ period: "2026-07-01" }] };
    if (sql.includes("COUNT(*)")) {
      this.events.push("transaction-read");
      return { columns: [], rows: [this.config.footer] };
    }
    if (sql.includes("FROM sap_transaction")) {
      this.events.push("transaction-read");
      return { columns: [], rows: this.config.pageRows };
    }
    return { columns: [], rows: [] };
  }

  async freshness() {
    return null;
  }
  async distinctValues() {
    return [];
  }
}

function batch(pin: ProvenanceBatch, isActive: boolean) {
  return { id: pin.batchId, source_kind: pin.source, period: pin.period, is_active: isActive ? 1 : 0 };
}

function transaction(value: string) {
  return {
    month: "2026-07-01",
    posting_date: "2026-07-14",
    txn_no: "1900001234",
    cost_center: "NURSERY",
    acct_name: "Sprout Cost - Imp",
    debit: value,
    credit: "0.00",
    value,
    reference: "REF-1",
    memo: "Seedlings",
  };
}

function fixtureTransaction(
  txnNo: string,
  debit: string,
  credit: string,
  overrides: Partial<Record<string, string>> = {},
) {
  return {
    batch_id: actualPin.batchId,
    plant: "DUB",
    gl_code: "50001201",
    line_id: txnNo,
    month: "2026-07-01",
    posting_date: "2026-07-14",
    txn_no: txnNo,
    cost_center: "NURSERY",
    acct_name: "Sprout Cost - Imp",
    debit,
    credit,
    reference: `REF-${txnNo}`,
    memo: "Fixture line",
    ...overrides,
  };
}

function matches(row: (typeof fixtureTransactions)[number], predicate: DrillPredicate): boolean {
  return (
    predicate.mode === "gl-and-plants" &&
    predicate.actualBatchIds.includes(row.batch_id) &&
    predicate.glCode === row.gl_code &&
    predicate.plants.includes(row.plant) &&
    row.month >= predicate.from &&
    row.month <= predicate.to
  );
}

function transactionValue(row: (typeof fixtureTransactions)[number]): bigint {
  return BigInt(toPaise(row.debit)) - BigInt(toPaise(row.credit));
}

function sum(rows: typeof fixtureTransactions, field: "debit" | "credit"): bigint {
  return rows.reduce((total, row) => total + BigInt(toPaise(row[field])), 0n);
}

function toPaise(value: string): string {
  const match = value.match(/^(-?)(\d+)\.(\d{2})$/);
  if (!match) throw new Error("Fixture money must have exactly two decimal places");
  return BigInt(`${match[1]}${match[2]}${match[3]}`).toString();
}

function formatPaise(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const digits = (value < 0n ? -value : value).toString().padStart(3, "0");
  return `${sign}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

const user: AuthUser = {
  id: "user-1",
  email: "finance@example.com",
  display_name: "Finance",
  is_active: true,
  roles: ["admin"],
  permissions: {
    actions: ["report"],
    domains: ["governed-financial"],
    measureIds: ["governed-financial.actual"],
    dimensionIds: ["gl_code"],
  },
  scope: [{ attribute: "plant", value: "DUB" }],
};
