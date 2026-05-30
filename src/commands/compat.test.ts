import test from "node:test";
import assert from "node:assert/strict";
import { commandAdapterInfo, commandTargetName, normalizeCommandName } from "./compat.js";

test("command adapter normalizes ClaudeCode command paths", () => {
  assert.equal(normalizeCommandName("add-dir/add-dir.tsx"), "add-dir");
  assert.equal(normalizeCommandName("clear\\conversation.ts"), "clear");
});

test("command adapter maps Claude-only aliases to DeepSeekCode commands", () => {
  assert.equal(commandTargetName("chrome/index.ts"), "browser");
  assert.equal(commandTargetName("statusline.tsx"), "status");
});

test("command adapter reports static compatibility info", () => {
  const info = commandAdapterInfo("review.ts");
  assert.equal(info.referenceName, "review");
  assert.equal(info.targetName, "review");
  assert.equal(info.implemented, true);
});
