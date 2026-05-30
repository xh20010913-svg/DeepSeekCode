import test from "node:test";
import assert from "node:assert/strict";
import {
  classifySystemText,
  formatSystemText,
} from "./SystemTextMessage.js";

test("system text classification highlights actionable command feedback", () => {
  assert.equal(classifySystemText("Usage: /cancel <run-id> [reason]"), "usage");
  assert.equal(classifySystemText("Unknown command /nope. Run /help."), "unknown-command");
  assert.equal(classifySystemText("provider missing"), "warning");
  assert.equal(classifySystemText("run failed"), "error");
  assert.equal(classifySystemText("Session renamed"), "info");
});

test("system text formatting compacts noisy terminal output", () => {
  assert.equal(formatSystemText("  a\n   b\tc  "), "a b c");
});
