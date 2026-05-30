import test from "node:test";
import assert from "node:assert/strict";
import {
  formatThinkingPreview,
  normalizeThinkingText,
} from "./ThinkingMessage.js";

test("thinking preview compacts provider reasoning into a single terminal line", () => {
  assert.equal(normalizeThinkingText("thinking:  step one\n step two  "), "step one step two");
  assert.equal(normalizeThinkingText("reasoning: cache hit path"), "cache hit path");
});

test("thinking preview has an empty-state label and cell-width truncation", () => {
  assert.equal(formatThinkingPreview("   "), "thinking...");
  assert.equal(formatThinkingPreview("abcdef", 5), "ab...");
  assert.equal(formatThinkingPreview("你好世界", 5), "你...");
});
