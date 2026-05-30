import test from "node:test";
import assert from "node:assert/strict";
import { RollingSummary } from "./rollingSummary.js";
import type { ChatMessage } from "../../protocol/provider.js";

test("RollingSummary keeps tail and summarizes older messages", () => {
  const history: ChatMessage[] = Array.from({ length: 16 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `message ${index}`,
  }));
  const summary = new RollingSummary();
  const tail = summary.absorb(history, 6);
  assert.equal(tail.length, 6);
  assert.match(summary.text, /message 0/);
  assert.match(tail[0]?.content ?? "", /message 10/);
});
