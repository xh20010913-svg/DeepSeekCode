import test from "node:test";
import assert from "node:assert/strict";
import { CircularBuffer } from "./CircularBuffer.js";
import { formatTokens, truncateToWidth } from "./format.js";
import { InputHistory } from "../history.js";
import { generateSessionTitle } from "./sessionTitle.js";

test("CircularBuffer keeps the newest values", () => {
  const buffer = new CircularBuffer<number>(2);
  buffer.push(1);
  buffer.push(2);
  buffer.push(3);
  assert.deepEqual(buffer.toArray(), [2, 3]);
});

test("InputHistory skips slash commands and restores drafts", () => {
  const history = new InputHistory();
  history.add("/help");
  history.add("hello");
  assert.equal(history.previous("draft"), "hello");
  assert.equal(history.next(), "draft");
  assert.deepEqual(history.snapshot(), ["hello"]);
  assert.deepEqual(history.snapshot({ newestFirst: true }), ["hello"]);
});

test("format helpers and session title are stable", () => {
  assert.equal(formatTokens(1500), "1.5K");
  assert.equal(truncateToWidth("abcdef", 4), "abc…");
  assert.equal(generateSessionTitle("  a   b  "), "a b");
});
