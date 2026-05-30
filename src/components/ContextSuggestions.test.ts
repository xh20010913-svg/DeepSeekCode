import test from "node:test";
import assert from "node:assert/strict";
import {
  contextSuggestionModel,
  formatContextSavingsTokens,
} from "./ContextSuggestions.js";

test("context suggestion model formats token savings", () => {
  const model = contextSuggestionModel({
    severity: "warning",
    title: "Context is getting expensive",
    detail: "Trim dynamic excerpts.",
    savingsTokens: 1536,
    command: "/cache plan ui",
  });

  assert.equal(model.tone, "warning");
  assert.equal(model.savingsLabel, "-> save ~1.5k tokens");
  assert.equal(model.command, "/cache plan ui");
});

test("context token savings use compact labels", () => {
  assert.equal(formatContextSavingsTokens(999), "999 tokens");
  assert.equal(formatContextSavingsTokens(1500), "1.5k tokens");
  assert.equal(formatContextSavingsTokens(15_100), "15k tokens");
});
