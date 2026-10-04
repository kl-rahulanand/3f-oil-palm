import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ResponseClass, type AuthUser, type MisSelectionPeriodOption } from "@3f/contract";
import { ChatService } from "../chat/chat.service";
import { SemanticLayer } from "../semantic/semanticLayer";
import { HelpService } from "./help.service";
import { unsupportedFallbackMessage } from "./glossary";

const EXPECTED_QUESTIONS = [
  "Actual by GL code for July 2026",
  "Actual and Budget by GL code for July 2026",
  "Which GL codes had Actual over Budget in July 2026?",
];

test("measure definitions suggest permitted 3F questions for the latest loaded month", async () => {
  const response = await ask("What is Actual?");

  assert.equal(response.responseClass, ResponseClass.Informational);
  assert.deepEqual(response.suggestedQuestions, EXPECTED_QUESTIONS);
});

test("dimension definitions suggest permitted 3F questions for the latest loaded month", async () => {
  const response = await ask("What is GL code?");

  assert.equal(response.responseClass, ResponseClass.Informational);
  assert.deepEqual(response.suggestedQuestions, EXPECTED_QUESTIONS);
});

test("dimension value matches suggest permitted 3F questions without a legacy fallback", async () => {
  const response = await ask("What is 50001201?");

  assert.equal(response.responseClass, ResponseClass.Informational);
  assert.deepEqual(response.suggestedQuestions, EXPECTED_QUESTIONS);
});

test("example questions use permitted measures and dimensions with the latest loaded month", async () => {
  const response = await ask("help");

  assert.equal(response.responseClass, ResponseClass.Informational);
  assert.deepEqual(response.suggestedQuestions, EXPECTED_QUESTIONS);
});

test("small-talk answers suggest permitted 3F questions for the latest loaded month", async () => {
  const response = await ask("hello");

  assert.equal(response.responseClass, ResponseClass.Informational);
  assert.deepEqual(response.suggestedQuestions, EXPECTED_QUESTIONS);
});

test("reconciliation answers suggest permitted 3F questions for the latest loaded month", async () => {
  for (const [question, statementGrounded] of [
    ["why is this different from before?", false],
    ["why is labour high?", false],
    ["why is this Actual high?", true],
  ] as const) {
    const response = await ask(question, statementGrounded);

    assert.equal(response.responseClass, ResponseClass.Informational, question);
    assert.deepEqual(response.suggestedQuestions, EXPECTED_QUESTIONS, question);
  }
});

test("unsupported fallbacks suggest permitted 3F questions for the latest loaded month", async () => {
  const index = await makeHelpService().buildIndex(USER);

  assert.match(unsupportedFallbackMessage(index), new RegExp(EXPECTED_QUESTIONS.join("; ").replaceAll("?", "\\?")));
});

test("measure-only grants keep definition small-talk and fallback suggestions governed", async () => {
  for (const question of ["What is Actual?", "hello"]) {
    const response = await ask(question, false, MEASURE_ONLY_USER);

    assert.equal(response.responseClass, ResponseClass.Informational, question);
    assert.deepEqual(response.suggestedQuestions, ["Actual for July 2026"], question);
  }

  const index = await makeHelpService().buildIndex(MEASURE_ONLY_USER);
  assert.match(unsupportedFallbackMessage(index), /Try one of: Actual for July 2026\./);
});

test("Ask suggestion sources contain no legacy MBS question literals", () => {
  const forbidden = /\b(?:state|leads?|rpush|conversion)\b|last 30 days/i;
  for (const path of [
    "backend/src/help/glossary.ts",
    "backend/src/help/help.service.ts",
    "backend/src/chat/smalltalk-guard.ts",
    "backend/src/chat/reconciliation-guard.ts",
  ]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), forbidden, path);
  }
});

async function ask(question: string, statementGrounded = false, user = USER) {
  const semantic = new SemanticLayer();
  const resolver = new PeriodResolver();
  const service = new ChatService(
    semantic,
    {} as never,
    { writeRequestEvent: async () => undefined, writeResultEvent: async () => undefined } as never,
    {} as never,
    {} as never,
    makeHelpService(semantic, resolver),
    resolver as never,
    {} as never,
    statementGrounded ? ({ explain: async () => ({ kind: "causal" }) } as never) : ({} as never),
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return service.ask(
    user,
    "session",
    question,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    statementGrounded
      ? {
          attestedContext: "context",
          department: "Agriculture",
          function: "Nursery",
          nodeMetadata: [],
          nodeAmounts: [],
        }
      : undefined,
  );
}

function makeHelpService(semantic = new SemanticLayer(), resolver = new PeriodResolver()): HelpService {
  return new HelpService(
    semantic,
    {
      values: async (_object: string, column: string) => (column === "gl_code" ? ["50001201"] : []),
    } as never,
    resolver as never,
  );
}

class PeriodResolver {
  async options() {
    const periods: MisSelectionPeriodOption[] = [
      { value: "2026-06-01", label: "2026-06-01", from: "2026-06-01", to: "2026-06-01" },
      { value: "2026-07-01", label: "2026-07-01", from: "2026-07-01", to: "2026-07-01" },
      { value: "fy26-27-ytd", label: "FY 26-27 YTD", from: "2026-04-01", to: "2026-07-01" },
    ];
    return { departments: [], functions: [], plants: [], periods };
  }
}

const USER: AuthUser = {
  id: "user-1",
  email: "finance@example.com",
  display_name: "Finance",
  is_active: true,
  roles: ["admin"],
  permissions: {
    actions: ["report"],
    domains: ["governed-financial"],
    measureIds: ["governed-financial.actual", "governed-financial.budget", "governed-financial.percentage"],
    dimensionIds: ["gl_code", "month"],
  },
  scope: [{ attribute: "plant", value: "DUB" }],
};

const MEASURE_ONLY_USER: AuthUser = {
  ...USER,
  permissions: {
    ...USER.permissions,
    measureIds: ["governed-financial.actual"],
    dimensionIds: [],
  },
};
