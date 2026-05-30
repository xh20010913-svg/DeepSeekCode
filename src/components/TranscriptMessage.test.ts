import test from "node:test";
import assert from "node:assert/strict";
import {
  estimateTranscriptRows,
  formatTranscriptText,
  hasTranscriptMetadata,
  truncateTranscriptText,
  transcriptRoleMeta,
} from "./TranscriptMessage.js";

test("transcript role metadata keeps message chrome compact and branded", () => {
  assert.deepEqual(transcriptRoleMeta("user"), { label: "You", tone: "brand" });
  assert.deepEqual(transcriptRoleMeta("assistant"), { label: "DeepSeekCode", tone: "success" });
  assert.deepEqual(transcriptRoleMeta("thinking"), { label: "thinking", tone: "muted", dimBody: true });
  assert.deepEqual(transcriptRoleMeta("tool-start"), { label: "tool", tone: "warning", dimBody: true });
  assert.deepEqual(transcriptRoleMeta("error"), { label: "error", tone: "error" });
});

test("transcript text formatting preserves user and tool bodies but compacts system output", () => {
  assert.equal(formatTranscriptText({ role: "user", text: "hello\nworld" }), "hello\nworld");
  assert.equal(formatTranscriptText({ role: "assistant", text: "  hello  " }), "hello");
  assert.equal(formatTranscriptText({ role: "system", text: "  a\n  b  " }), "a b");
  assert.equal(formatTranscriptText({ role: "thinking", text: "thinking:  a\n  b  " }), "a b");
  assert.equal(formatTranscriptText({ role: "tool-start", text: "  run_command started npm test  " }), "run_command started npm test");
  assert.equal(formatTranscriptText({ role: "tool", text: "  ok\n  done  " }), "ok\n  done");
});

test("transcript row estimate accounts for message chrome", () => {
  assert.equal(estimateTranscriptRows({ role: "assistant", text: "one\ntwo" }), 4);
  assert.equal(
    estimateTranscriptRows({ role: "assistant", text: "one\ntwo", timestamp: new Date(2026, 0, 2, 3, 4), model: "deepseek-v4-flash" }),
    5,
  );
  assert.equal(estimateTranscriptRows({ role: "tool-start", text: "run_command started npm test" }), 2);
  assert.equal(estimateTranscriptRows({ role: "tool", text: "write_file succeeded" }), 2);
  assert.equal(estimateTranscriptRows({ role: "thinking", text: "thinking: one" }), 3);
});

test("transcript metadata stays assistant-only", () => {
  assert.equal(hasTranscriptMetadata({ role: "assistant", text: "ok", model: "deepseek-v4-flash" }), true);
  assert.equal(hasTranscriptMetadata({ role: "assistant", text: "ok", streaming: true }), true);
  assert.equal(hasTranscriptMetadata({ role: "user", text: "ok", timestamp: Date.now() }), false);
});

test("transcript truncation keeps head and tail for very long prompts", () => {
  const text = "head\nmiddle\nmiddle\nmiddle\ntail";
  assert.equal(
    truncateTranscriptText(text, { maxChars: 12, headChars: 5, tailChars: 4 }),
    "head\n\n... +3 hidden lines ...\ntail",
  );
});
