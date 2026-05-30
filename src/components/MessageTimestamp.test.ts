import test from "node:test";
import assert from "node:assert/strict";
import { formatMessageTimestamp } from "./MessageTimestamp.js";

test("message timestamp formats compact transcript time", () => {
  assert.equal(formatMessageTimestamp(new Date(2026, 0, 2, 3, 4)), "03:04 AM");
});

test("message timestamp ignores missing or invalid values", () => {
  assert.equal(formatMessageTimestamp(), null);
  assert.equal(formatMessageTimestamp("not-a-date"), null);
});
