import test from "node:test";
import assert from "node:assert/strict";
import { promptNoticeText } from "./PromptNoticePanel.js";

test("prompt notice names the double escape clear action", () => {
  assert.equal(
    promptNoticeText("clear-pending"),
    "Press Esc again to clear the current input.",
  );
});
