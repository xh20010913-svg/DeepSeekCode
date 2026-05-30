import test from "node:test";
import assert from "node:assert/strict";
import { buildTokenWarning, DEEPSEEKCODE_SOFT_CONTEXT_LIMIT } from "./TokenWarning.js";

test("token warning stays quiet below the soft context threshold", () => {
  assert.equal(buildTokenWarning({ tokenUsage: 1000, model: "deepseek-v4-flash" }), null);
});

test("token warning adapts Claude-style context warning to DeepSeekCode soft limits", () => {
  const warning = buildTokenWarning({
    tokenUsage: DEEPSEEKCODE_SOFT_CONTEXT_LIMIT * 0.8,
    model: "deepseek-v4-flash",
  });

  assert.equal(warning?.contextLimit, DEEPSEEKCODE_SOFT_CONTEXT_LIMIT);
  assert.equal(warning?.model, "deepseek-v4-flash");
});

test("token warning accepts explicit context limits for command displays", () => {
  const warning = buildTokenWarning({
    tokenUsage: 9000,
    contextLimit: 10_000,
    model: "custom",
  });

  assert.equal(warning?.contextLimit, 10_000);
});
