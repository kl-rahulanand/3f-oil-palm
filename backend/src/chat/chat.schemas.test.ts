import assert from "node:assert/strict";
import { test } from "node:test";
import type { AskPriorTurn, Selection } from "@3f/contract";
import { askSchema } from "./chat.schemas";

test("the request schema rejects an oversize prior turns array payload or question before serialization", () => {
  assert.equal(askSchema.safeParse({ question: "Show Actual", priorTurns: turns(9) }).success, false);

  const payloadHeavy = turns(8).map((turn, index) => ({
    ...turn,
    selection: {
      ...turn.selection,
      filters: [{ dimensionId: "gl_code", op: "in" as const, value: [`${index}-${"x".repeat(1990)}`] }],
    },
  }));
  assert.ok(JSON.stringify(payloadHeavy).length > 16_000);
  assert.equal(askSchema.safeParse({ question: "Show Actual", priorTurns: payloadHeavy }).success, false);

  const questionHeavy = turns(1);
  questionHeavy[0]!.question = "x".repeat(2001);
  assert.equal(askSchema.safeParse({ question: "Show Actual", priorTurns: questionHeavy }).success, false);
});

test("the strict chat schema accepts statementGrounding and still rejects an unknown key", () => {
  const statementGrounding = {
    attestedContext: "claims.signature",
    department: "Agriculture",
    function: "Nursery",
    focus: { nodeKey: "leaf", block: "selected", subject: "actual" },
    nodeMetadata: [{ nodeKey: "leaf", glCodes: ["5001"], costCentres: ["Primary"] }],
    nodeAmounts: [{ nodeKey: "leaf", block: "selected", actualPaise: "10001" }],
  };
  assert.equal(askSchema.safeParse({ question: "How is this built?", statementGrounding }).success, true);
  assert.equal(
    askSchema.safeParse({ question: "How is this built?", statementGrounding, unknown: true }).success,
    false,
  );
});

test("an absent focus returns focus required rather than being rejected by the schema", () => {
  const statementGrounding = {
    attestedContext: "claims.signature",
    department: "Agriculture",
    function: "Nursery",
    nodeMetadata: [{ nodeKey: "leaf", glCodes: ["5001"], costCentres: ["Primary"] }],
    nodeAmounts: [{ nodeKey: "leaf", block: "selected", actualPaise: "10001" }],
  };

  assert.equal(askSchema.safeParse({ question: "How is this built?", statementGrounding }).success, true);
  assert.equal(
    askSchema.safeParse({
      question: "How is this built?",
      statementGrounding: { ...statementGrounding, focus: { nodeKey: "leaf", subject: "actual" } },
    }).success,
    false,
  );
  assert.equal(
    askSchema.safeParse({
      question: "How is this built?",
      statementGrounding: { ...statementGrounding, focus: { block: "selected", subject: "actual" } },
    }).success,
    false,
  );
});

test("oversized node metadata arrays are rejected by the schema before being sorted and hashed", () => {
  const base = {
    attestedContext: "claims.signature",
    department: "Agriculture",
    function: "Nursery",
    nodeAmounts: [{ nodeKey: "leaf", block: "selected", actualPaise: "10001" }],
  };
  assert.equal(
    askSchema.safeParse({
      question: "How is this built?",
      statementGrounding: {
        ...base,
        nodeMetadata: Array.from({ length: 501 }, (_, index) => ({
          nodeKey: `leaf-${index}`,
          glCodes: ["5001"],
          costCentres: ["Primary"],
        })),
      },
    }).success,
    false,
  );
  assert.equal(
    askSchema.safeParse({
      question: "How is this built?",
      statementGrounding: {
        ...base,
        nodeMetadata: [{ nodeKey: "leaf", glCodes: Array(101).fill("5001"), costCentres: ["Primary"] }],
      },
    }).success,
    false,
  );
});

test("Ask accepts a measure filter on a direct selection and a prior turn but rejects a malformed filter", () => {
  const filteredSelection = {
    ...selection,
    measureFilters: [
      {
        measureId: "governed-financial.actual",
        op: "gt" as const,
        compareTo: { kind: "measure" as const, measureId: "governed-financial.budget" },
      },
    ],
  };

  assert.equal(askSchema.safeParse({ question: "Show lines over budget", selection: filteredSelection }).success, true);
  assert.equal(
    askSchema.safeParse({
      question: "What changed?",
      priorTurns: [{ question: "Show lines over budget", selection: filteredSelection }],
    }).success,
    true,
  );
  assert.equal(
    askSchema.safeParse({
      question: "What changed?",
      priorTurns: [
        {
          question: "Show lines over budget",
          selection: {
            ...selection,
            measureFilters: [
              {
                measureId: "governed-financial.actual",
                op: "gt",
                compareTo: { kind: "value" },
              },
            ],
          },
        },
      ],
    }).success,
    false,
  );
});

test("Ask accepts each plant request origin and rejects an unknown origin", () => {
  for (const origin of ["plant-choice", "period-choice", "saved-view", "pin"]) {
    assert.equal(askSchema.safeParse({ question: "Show Actual", origin }).success, true);
  }

  assert.equal(askSchema.safeParse({ question: "Show Actual", origin: "report-grounding" }).success, false);
});

const selection: Selection = {
  domain: "governed-financial",
  measureIds: ["governed-financial.actual"],
  dimensionIds: ["gl_code"],
  filters: [],
};

function turns(count: number): AskPriorTurn[] {
  return Array.from({ length: count }, (_, index) => ({
    question: `Question ${index}`,
    selection,
  }));
}
