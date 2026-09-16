import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyStatementIntent, type StatementIntent } from "./statement-intent";

test("the intent fixture table resolves composition and causal and lets the causal cue win when both appear", () => {
  const fixtures: Array<[string, StatementIntent]> = [
    ["how is this 85000", "composition"],
    ["what makes up this figure", "composition"],
    ["break down this amount", "composition"],
    ["why is this high", "causal"],
    ["how is this built and why is it high", "causal"],
    ["show actual by GL", "data"],
  ];

  for (const [question, expected] of fixtures) {
    assert.equal(classifyStatementIntent(question), expected, question);
  }
});
