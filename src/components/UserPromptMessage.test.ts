import test from "node:test";
import assert from "node:assert/strict";
import {
  formatUserPromptText,
  splitPromptSegments,
} from "./UserPromptMessage.js";

test("user prompt text keeps head and tail for large pasted input", () => {
  const text = "head\nmiddle\nmiddle\ntail";
  assert.equal(
    formatUserPromptText(text, { maxChars: 10, headChars: 4, tailChars: 4 }),
    "head\n... +3 hidden lines ...\ntail",
  );
});

test("user prompt segments highlight slash commands and file mentions", () => {
  assert.deepEqual(splitPromptSegments("/review @src/index.ts please"), [
    { kind: "command", text: "/review" },
    { kind: "text", text: " " },
    { kind: "mention", text: "@src/index.ts" },
    { kind: "text", text: " please" },
  ]);
  assert.deepEqual(splitPromptSegments("plain text"), [
    { kind: "text", text: "plain text" },
  ]);
});
