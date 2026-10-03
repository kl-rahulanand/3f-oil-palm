import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { DECORATORS } from "@nestjs/swagger/dist/constants";
import type { AskPriorTurn, Selection } from "@3f/contract";
import { askSchema, ChatResponseDto } from "./chat.schemas";

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

test("the row-label DTO publishes required label fields and an optional bounded remainder", () => {
  const rowLabels = Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES, ChatResponseDto.prototype, "rowLabels") as {
    type: Function;
    required: boolean;
    isArray: boolean;
  };
  const rowLabelDto = rowLabels.type;
  const properties = Object.fromEntries(
    modelProperties(rowLabelDto).map((key) => [
      key,
      Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES, rowLabelDto.prototype, key) as Record<string, unknown>,
    ]),
  );

  assert.equal(rowLabels.isArray, true);
  assert.equal(rowLabels.required, false);
  assert.deepEqual(properties.key, {
    type: String,
    description: "Raw result row key used to match this label to the answer row.",
  });
  assert.deepEqual(properties.label, {
    type: String,
    description: "Primary human-readable label for the row.",
  });
  assert.deepEqual(properties.otherLabels, {
    type: String,
    isArray: true,
    description: "Additional labels included in the bounded disclosure, in display order.",
  });
  assert.deepEqual(properties.hiddenOtherLabelCount, {
    type: "integer",
    minimum: 1,
    description: "Number of additional account names beyond the bounded otherLabels list.",
    required: false,
    isArray: false,
  });
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

function modelProperties(model: Function): string[] {
  return (
    (Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES_ARRAY, model.prototype) as string[] | undefined) ?? []
  ).map((property) => property.replace(/^:/, ""));
}
