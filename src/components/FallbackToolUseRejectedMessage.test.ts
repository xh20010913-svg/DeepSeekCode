import test from "node:test";
import assert from "node:assert/strict";
import { isFallbackToolUseRejectedText } from "./FallbackToolUseRejectedMessage.js";

test("fallback rejected tool message detects user rejection text", () => {
  assert.equal(isFallbackToolUseRejectedText("<tool_use_rejected />"), true);
  assert.equal(isFallbackToolUseRejectedText("Tool use rejected by user"), true);
  assert.equal(isFallbackToolUseRejectedText("run_command succeeded"), false);
});
