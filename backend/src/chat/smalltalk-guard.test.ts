import assert from "node:assert/strict";
import { describe, it, test } from "node:test";
import { classifySmalltalk } from "./smalltalk-guard";

test("general chat is answered from deterministic templates containing no numeral that could read as a data value", () => {
  for (const question of ["hello", "thanks", "what can you do"]) {
    const response = classifySmalltalk(question);
    assert.ok(response);
    const rendered = JSON.stringify(response).replaceAll("3F", "");
    assert.doesNotMatch(rendered, /\d/);
  }
});

describe("classifySmalltalk", () => {
  it("matches greetings, thanks, and capability questions", () => {
    for (const question of [
      "hi",
      "Hello!",
      "hello there",
      "Hi, team",
      "hey team",
      "thanks",
      "good morning",
      "who are you",
      "help",
      "what can you do",
    ]) {
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
