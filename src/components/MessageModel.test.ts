import test from "node:test";
import assert from "node:assert/strict";
import { formatMessageModel } from "./MessageModel.js";

test("message model labels assistant transcript metadata", () => {
  assert.equal(formatMessageModel(" deepseek-v4-flash "), "deepseek-v4-flash");
  assert.equal(formatMessageModel("deepseek-v4-flash", true), "deepseek-v4-flash streaming");
  assert.equal(formatMessageModel(undefined, true), "streaming");
  assert.equal(formatMessageModel(), null);
});
