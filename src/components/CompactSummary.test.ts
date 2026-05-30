import test from "node:test";
import assert from "node:assert/strict";
import { compactSummaryLines, compactSummaryModel } from "./CompactSummary.js";

test("compact summary model exposes compact ratio and tail rows", () => {
  const model = compactSummaryModel({
    sessionId: "session_123",
    totalRecords: 10,
    summarizedRecords: 6,
    summary: "user: older request\nassistant: older answer",
    tailRecords: [
      { id: "1", role: "user", text: "new request", createdAtMs: 1 },
      { id: "2", role: "assistant", text: "new answer", createdAtMs: 2 },
    ],
  });

  assert.equal(model.ratio, 0.6);
  assert.equal(model.summaryLines.length, 2);
  assert.deepEqual(model.tailRows.map((row) => row.role), ["user", "assistant"]);
  assert.match(model.footer, /compact preview/);
});

test("compact summary lines ignore blank lines and clamp output", () => {
  assert.deepEqual(compactSummaryLines("\n one \n\n two \n three", 2), ["one", "two"]);
});
