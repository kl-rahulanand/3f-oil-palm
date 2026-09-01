import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifySmalltalk } from "./smalltalk-guard";

describe("classifySmalltalk", () => {
  it("matches greetings, thanks, and capability questions", () => {
    for (const question of ["hi", "Hello!", "thanks", "good morning", "who are you", "help", "what can you do"]) {
      const result = classifySmalltalk(question);
      assert.ok(result, question);
      assert.equal(result.definitionKind, "meta");
      assert.ok(result.suggestedQuestions.length > 0);
    }
  });

  it("does not match analytics or glossary questions", () => {
    for (const question of [
      "lead count by state",
      "what is RPush",
      "fresh leads",
      "why did it change",
      "history of leads",
      "hide unassigned leads",
    ]) {
      assert.equal(classifySmalltalk(question), null, question);
    }
  });
});
