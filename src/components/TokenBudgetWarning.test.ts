import test from "node:test";
import assert from "node:assert/strict";
import { buildTokenBudgetWarning } from "./TokenBudgetWarning.js";

test("token budget warning stays quiet below threshold", () => {
  assert.equal(
    buildTokenBudgetWarning({ usedTokens: 2000, contextLimit: 10000, model: "deepseek-v4-flash" }),
    null,
  );
});

test("token budget warning reports warning and critical states", () => {
  const warning = buildTokenBudgetWarning({
    usedTokens: 8000,
    contextLimit: 10000,
    model: "deepseek-v4-flash",
  });
  assert.equal(warning?.state, "warning");
  assert.equal(warning?.title, "context 80% used");

  const critical = buildTokenBudgetWarning({
    usedTokens: 9500,
    contextLimit: 10000,
    model: "deepseek-v4-flash",
  });
  assert.equal(critical?.state, "error");
  assert.match(critical?.recommendation ?? "", /compact/);
});

test("token budget warning rejects invalid limits", () => {
  assert.equal(buildTokenBudgetWarning({ usedTokens: 10, contextLimit: 0, model: "x" }), null);
});
