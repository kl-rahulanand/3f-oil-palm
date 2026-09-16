import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyCausalQuestion, classifyReconciliationQuestion } from "./reconciliation-guard";

test("classifies reconciliation questions", () => {
  for (const question of [
    "above the total leads were 1939 and now 1944, why?",
    "why is this different from before?",
    "why did the number change?",
    "these don't match, can you reconcile?",
  ]) {
    const result = classifyReconciliationQuestion(question);

    assert.equal(result?.title, "Comparing two results", question);
    assert.equal(result?.definitionKind, "meta", question);
  }
});

test("an ungrounded causal question still receives the shipped causal copy", () => {
  assert.deepEqual(classifyCausalQuestion("why is labour high?"), {
    title: "Causal analysis is not configured",
    definitionKind: "meta",
    definition:
      "I can't infer why a result is high or low. Ask what the governed numbers show for a specific metric or breakdown.",
    suggestedQuestions: ["Show an available metric", "Break down an available metric"],
  });
});

test("ignores normal data, glossary, and bare causal questions", () => {
  for (const question of [
    "lead count by state",
    "how many fresh leads?",
    "leads by record type",
    "what is RPush?",
    "why are there unassigned leads",
  ]) {
    assert.equal(classifyReconciliationQuestion(question), null, question);
  }
});
