import test from "node:test";
import assert from "node:assert/strict";
import {
  formatQueuedPromptPreview,
  visibleQueuedPrompts,
} from "./QueuedPromptPanel.js";

test("queued prompt preview compacts whitespace and clips long prompts", () => {
  assert.equal(formatQueuedPromptPreview("  fix\n\nthis file  ", 40), "fix this file");
  assert.equal(formatQueuedPromptPreview("abcdefghijklmnopqrstuvwxyz", 10), "abcdefg...");
});

test("queued prompt visibility keeps the oldest queued prompts first", () => {
  assert.deepEqual(
    visibleQueuedPrompts(["one", "two", "three", "four"], 3),
    ["one", "two", "three"],
  );
});
