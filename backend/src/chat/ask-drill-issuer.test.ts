import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser, ProvenanceBatch, ResultTable, Selection } from "@3f/contract";
import type { DrillPredicate, DrillSummary } from "../warehouse/drill-transactions.interface";
import { AskDrillContextService } from "./ask-drill-context";
import { issueAskDrill, type AskDrillPreparedAnswer } from "./ask-drill-issuer";

const actualPin: ProvenanceBatch & { source: "actuals" } = {
  source: "actuals",
  period: "2026-07-01",
  batchId: "00000000-0000-0000-0000-000000000001",
};
const budgetPin: ProvenanceBatch = {
  source: "budget",
  period: "2026-07-01",
  batchId: "00000000-0000-0000-0000-000000000002",
};
const selection: Selection = {
  domain: "governed-financial",
  measureIds: ["governed-financial.actual"],
  dimensionIds: ["gl_code"],
  filters: [],
  timeWindow: { grain: "month", from: "2026-07-01", to: "2026-07-01" },
};
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

test("issuance compares exact displayed paise, keeps a cent, and reports a mismatch as inert", async () => {
  const answer = glAnswer(
    [
      { gl_code: "one-paisa", actual: 0.01 },
      { gl_code: "mismatch", actual: 1 },
      { gl_code: "zero-lines", actual: 0 },
    ],
    ["one-paisa", "mismatch", "zero-lines"],
  );
  const { deps, contexts } = fixture([
    { rowKey: "one-paisa", feedingLineCount: 1, value: "0.01" },
    { rowKey: "mismatch", feedingLineCount: 1, value: "2.00" },
    { rowKey: "zero-lines", feedingLineCount: 0, value: "0.00" },
  ]);

  const issued = await issueAskDrill(deps, answer);

  assert.deepEqual(issued.drill?.rows, [
    { key: "one-paisa", drillable: true },
    { key: "mismatch", drillable: false },
    { key: "zero-lines", drillable: false },
  ]);
  assert.deepEqual(issued.dataMismatchRowKeys, ["mismatch"]);
  const verified = contexts.verify(issued.drill!.context, user.id);
  assert.equal(verified.outcome, "verified");
  if (verified.outcome === "verified") {
    assert.deepEqual(
      verified.claims.rows.map(({ actualPaise }) => actualPaise),
      ["1", "100", "0"],
    );
  }
});

test("Actuals just below the size limit stay exact while both signs at the limit carry no amount", async () => {
  const limit = 2 ** 46;
  const rows = [
    { gl_code: "positive-below", actual: limit - 0.01 },
    { gl_code: "negative-below", actual: -limit + 0.01 },
    { gl_code: "positive-limit", actual: limit },
    { gl_code: "negative-limit", actual: -limit },
  ];
  const answer = glAnswer(
    rows,
    rows.map(({ gl_code }) => gl_code),
  );
  const { deps, contexts, summarized } = fixture([
    { rowKey: "positive-below", feedingLineCount: 1, value: "70368744177663.99" },
    { rowKey: "negative-below", feedingLineCount: 1, value: "-70368744177663.99" },
  ]);

  const issued = await issueAskDrill(deps, answer);

  assert.deepEqual(issued.drill?.rows, [
    { key: "positive-below", drillable: true },
    { key: "negative-below", drillable: true },
    { key: "positive-limit", drillable: false },
    { key: "negative-limit", drillable: false },
  ]);
  assert.deepEqual(summarized, ["positive-below", "negative-below"]);
  const verified = contexts.verify(issued.drill!.context, user.id);
  assert.equal(verified.outcome, "verified");
  if (verified.outcome === "verified") {
    assert.deepEqual(verified.claims.rows, [
      { key: "positive-below", actualPaise: "7036874417766399", drillable: true },
      { key: "negative-below", actualPaise: "-7036874417766399", drillable: true },
      { key: "positive-limit", drillable: false },
      { key: "negative-limit", drillable: false },
    ]);
  }
});

test("a multi-period statement claim binds the final budget outline digest and row triples", async () => {
  const statementSelection: Selection = {
    domain: "mis-statement",
    measureIds: ["mis-statement.actual_net"],
    dimensionIds: ["leaf_key"],
    filters: [],
    timeWindow: { grain: "month", from: "2026-04-01", to: "2026-07-01" },
  };
  const triple = { plant: "DUB", costCenter: "NURSERY", glCode: "50001201" };
  const { deps, contexts, outlineCalls, digestCalls } = fixture([
    { rowKey: "leaf", feedingLineCount: 1, value: "125.01" },
  ]);
  const answer: AskDrillPreparedAnswer = {
    user: {
      ...user,
      permissions: {
        ...user.permissions,
        domains: ["mis-statement"],
        measureIds: ["mis-statement.actual_net"],
        dimensionIds: ["leaf_key"],
      },
    },
    selection: statementSelection,
    result: result("leaf_key", "actual_net", [{ leaf_key: "leaf", actual_net: 125.01 }]),
    shape: {
      kind: "statement",
      dimensionId: "leaf_key",
      actualMeasureId: "mis-statement.actual_net",
      actualColumn: "actual_net",
    },
    rowKeys: ["leaf"],
    actualPins: [actualPin],
    budgetPin,
    range: { from: "2026-04-01", to: "2026-07-01" },
    plants: ["DUB"],
    predicates: [{ rowKey: "leaf", predicate: statementPredicate(triple) }],
  };

  const issued = await issueAskDrill(deps, answer);

  assert.deepEqual(outlineCalls, [budgetPin.batchId]);
  assert.deepEqual(digestCalls, [["mis-statement.actual_net"]]);
  const verified = contexts.verify(issued.drill!.context, user.id);
  assert.equal(verified.outcome, "verified");
  if (verified.outcome === "verified") {
    assert.deepEqual(verified.claims.budget, { pin: budgetPin, outlineDigest: "final-outline-digest" });
    assert.deepEqual(verified.claims.rows[0]?.triples, [triple]);
  }
});

test("an Actual-bearing answer signs no Actual when the reader holds only the Budget grant", async () => {
  const answer = glAnswer([{ gl_code: "50001201", actual: 125.01, budget: 100 }], ["50001201"]);
  answer.selection = {
    ...selection,
    measureIds: ["governed-financial.actual", "governed-financial.budget"],
  };
  answer.user = {
    ...user,
    permissions: { ...user.permissions, measureIds: ["governed-financial.budget"] },
  };
  const { deps, summarized } = fixture([{ rowKey: "50001201", feedingLineCount: 1, value: "125.01" }]);

  const issued = await issueAskDrill(deps, answer);

  assert.deepEqual(issued, { dataMismatchRowKeys: [] });
  assert.doesNotMatch(JSON.stringify(issued), /actualPaise|12501/);
  assert.deepEqual(summarized, []);
});

function glAnswer(rows: ResultTable["rows"], rowKeys: string[]): AskDrillPreparedAnswer {
  return {
    user,
    selection,
    result: result("gl_code", "actual", rows),
    shape: {
      kind: "gl",
      dimensionId: "gl_code",
      actualMeasureId: "governed-financial.actual",
      actualColumn: "actual",
    },
    rowKeys,
    actualPins: [actualPin],
    budgetPin,
    range: { from: "2026-07-01", to: "2026-07-01" },
    plants: ["DUB"],
    predicates: rowKeys.map((rowKey) => ({ rowKey, predicate: glPredicate(rowKey) })),
  };
}

function result(dimension: string, actual: string, rows: ResultTable["rows"]): ResultTable {
  return {
    columns: [
      { key: dimension, label: dimension, numeric: false },
      { key: actual, label: "Actual", numeric: true, format: "money" },
    ],
    rows,
  };
}

function glPredicate(glCode: string): DrillPredicate {
  return {
    mode: "gl-and-plants",
    actualBatchIds: [actualPin.batchId],
    glCode,
    plants: ["DUB"],
    filters: [],
    from: "2026-07-01",
    to: "2026-07-01",
  };
}

function statementPredicate(triple: { plant: string; costCenter: string; glCode: string }): DrillPredicate {
  return {
    mode: "triples",
    actualBatchIds: [actualPin.batchId],
    triples: [triple],
    plants: ["DUB"],
    from: "2026-04-01",
    to: "2026-07-01",
  };
}

function fixture(summaries: DrillSummary[]) {
  const contexts = new AskDrillContextService(["secret"], 30, () => 1_000_000);
  const summarized: string[] = [];
  const outlineCalls: string[] = [];
  const digestCalls: string[][] = [];
  return {
    contexts,
    summarized,
    outlineCalls,
    digestCalls,
    deps: {
      transactions: {
        async summarize(rows: Array<{ rowKey: string; predicate: DrillPredicate }>) {
          summarized.push(...rows.map(({ rowKey }) => rowKey));
          const keys = new Set(rows.map(({ rowKey }) => rowKey));
          return summaries.filter(({ rowKey }) => keys.has(rowKey));
        },
      },
      contexts,
      outlines: {
        async findByBudgetBatchId(batchId: string) {
          outlineCalls.push(batchId);
          return [
            {
              nodeKey: "leaf",
              parentKey: null,
              depth: 0,
              sNo: "1.1",
              label: "Sprout Cost",
              sortOrder: 1,
              glCode: "50001201",
              leafKey: "leaf",
            },
          ];
        },
      },
      statementAttestation: {
        outlineDigest(_outline: unknown, blocks: readonly string[]) {
          digestCalls.push([...blocks]);
          return "final-outline-digest";
        },
      },
    },
  };
}
