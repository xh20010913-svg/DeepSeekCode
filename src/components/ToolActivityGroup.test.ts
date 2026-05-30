import test from "node:test";
import assert from "node:assert/strict";
import {
  buildToolActivitySummary,
  estimateToolActivityGroupRows,
  formatToolActivityCounts,
  parseToolActivityRecord,
} from "./ToolActivityGroup.js";

test("tool activity parser handles starts and structured results", () => {
  assert.deepEqual(parseToolActivityRecord({ role: "tool-start", text: "run_command started npm test" }), {
    action: "run_command",
    status: "running",
    detail: "npm test",
    tone: "warning",
  });
  assert.deepEqual(parseToolActivityRecord({ role: "tool", text: "write_file succeeded src/index.ts\nok" }), {
    action: "write_file",
    status: "succeeded",
    detail: "src/index.ts",
    tone: "success",
  });
});

test("tool activity summary counts statuses and actions", () => {
  const summary = buildToolActivitySummary([
    { role: "tool-start", text: "read_file started src/a.ts" },
    { role: "tool", text: "read_file succeeded src/a.ts\nbytes=10" },
    { role: "tool", text: "grep failed\nno matches" },
    { role: "tool", text: "run_command succeeded\nexit=0\noutput=ok" },
  ]);

  assert.equal(summary.total, 4);
  assert.equal(summary.running, 1);
  assert.equal(summary.succeeded, 2);
  assert.equal(summary.failed, 1);
  assert.equal(summary.tone, "error");
  assert.deepEqual(summary.counts.slice(0, 2), [
    { action: "read_file", count: 2 },
    { action: "grep", count: 1 },
  ]);
});

test("tool activity summary formats compact status text", () => {
  const summary = buildToolActivitySummary([
    { role: "tool", text: "read_file succeeded src/a.ts\nok" },
    { role: "tool", text: "read_file succeeded src/b.ts\nok" },
    { role: "tool", text: "grep succeeded\nok" },
  ]);
  assert.equal(formatToolActivityCounts(summary), "read_file 2, grep 1 | ok 3");
  assert.equal(estimateToolActivityGroupRows([{ role: "tool", text: "ok" }, { role: "tool", text: "ok" }]), 5);
});
