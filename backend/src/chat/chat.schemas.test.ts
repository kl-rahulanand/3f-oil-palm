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
    nodeKey: "leaf",
    block: "selected",
    nodeMetadata: [{ nodeKey: "leaf", glCodes: ["5001"], costCentres: ["Primary"] }],
  };
  assert.equal(askSchema.safeParse({ question: "How is this built?", statementGrounding }).success, true);
  assert.equal(
    askSchema.safeParse({ question: "How is this built?", statementGrounding, unknown: true }).success,
    false,
  );
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
