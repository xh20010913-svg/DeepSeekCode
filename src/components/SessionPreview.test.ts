import test from "node:test";
import assert from "node:assert/strict";
import { previewRoleCounts, sessionPreviewModel } from "./SessionPreview.js";

test("session preview model summarizes transcript roles", () => {
  const model = sessionPreviewModel([
    { id: "u1", role: "user", text: "hello", createdAtMs: 1 },
    { id: "a1", role: "assistant", text: "answer\nmore", createdAtMs: 2, runId: "run_123456789" },
    { id: "t1", role: "tool", text: "read_file ok", createdAtMs: 3 },
  ], "resume preview", 2);

  assert.equal(model.title, "resume preview");
  assert.match(model.summary, /3 messages/);
  assert.match(model.summary, /1 user/);
  assert.match(model.summary, /1 assistant/);
  assert.match(model.summary, /1 tool/);
  assert.equal(model.rows.length, 2);
  assert.equal(model.rows[0]?.text, "answer");
  assert.match(model.rows[0]?.note ?? "", /run_1234\.\.\./);
  assert.equal(model.rows[1]?.marker, ">");
});

test("session preview role counts group unknown roles", () => {
  const counts = previewRoleCounts([
    { id: "s1", role: "system", text: "notice", createdAtMs: 1 },
    { id: "e1", role: "error", text: "failed", createdAtMs: 2 },
  ]);
  assert.equal(counts.other, 1);
  assert.equal(counts.error, 1);
});
