import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpException } from "@nestjs/common";
import type { AuthUser, ProvenanceBatch } from "@3f/contract";
import { SqlValidator } from "../sql/sqlValidator";
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
  const warehouse = new FakeWarehouse(events, {
    batches: [batch(actualPin, true)],
    pageRows: [transaction("8398339.00")],
    footer: { total_count: "1", debit: "8398339.00", credit: "0.00", value: "8398339.00" },
  });
  const { controller, contexts, audit } = harness(warehouse, events);
  const response = await controller.run(
    { ...user, scope: [...user.scope, { attribute: "plant", value: "H.O" }] },
    "session-1",
    { context: contexts.issue(input), rowKey: "50001201", page: 1 },
  );

  assert.equal(response.footer.value, "8398339.00");
  assert.deepEqual(
    { page: response.page, pageSize: response.pageSize, totalCount: response.totalCount },
    { page: 1, pageSize: 100, totalCount: 1 },
  );
  assert.equal(response.lines[0]?.txnNo, "1900001234");
  const pageSql = warehouse.executed.find((sql) => sql.includes("ORDER BY (txn.debit - txn.credit)"))!;
  assert.match(pageSql, /txn\.gl_code = '50001201'/);
  assert.match(pageSql, /txn\.plant IN \('DUB'\)/);
  assert.doesNotMatch(pageSql, /H\.O/);
  assert.ok(events.indexOf("audit-request") < events.indexOf("transaction-read"));
  assert.equal(audit.requests[0]?.questionLabel, "Ask transaction drill");
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

  const gone = harness(new FakeWarehouse([], { batches: [] }), []);
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
      String(error.message).includes("no longer available"),
  );
  assert.equal(
    gone.warehouse.executed.some((sql) => sql.includes("ORDER BY (txn.debit - txn.credit)")),
    false,
  );
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

  const gone = harness(new FakeWarehouse([], { batches: [batch(actualPin, true)] }), []);
  await assert.rejects(
    () =>
      gone.controller.run(statementUser, "session-1", {
        context: gone.contexts.issue(statement),
        rowKey: statement.rows[0]!.key,
        page: 1,
      }),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 409,
  );
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
