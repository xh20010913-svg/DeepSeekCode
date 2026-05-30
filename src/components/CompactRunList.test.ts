import test from "node:test";
import assert from "node:assert/strict";
import { compactRunListRows } from "./CompactRunList.js";

test("compact run list rows summarize status, counts, and cache", () => {
  const rows = compactRunListRows([{
    id: "run_123456789",
    projectPath: "D:\\project",
    model: "deepseek-v4-flash",
    status: "running",
    message: "agent:builder fix the panel",
    createdAtMs: 1,
    updatedAtMs: 2,
    actionCount: 3,
    artifactCount: 1,
    eventCount: 5,
    cacheHitTokens: 90,
    cacheMissTokens: 10,
  }]);

  assert.equal(rows[0]?.status, "running");
  assert.equal(rows[0]?.tone, "warning");
  assert.match(rows[0]?.summary ?? "", /3a 1f 5e/);
  assert.match(rows[0]?.detail ?? "", /cache=90%/);
});

test("compact run list rows respect the visible limit", () => {
  const rows = compactRunListRows([
    runRecord("run_1", "succeeded"),
    runRecord("run_2", "failed"),
  ], 1);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.key, "run_1");
  assert.equal(rows[0]?.tone, "success");
});

function runRecord(id: string, status: "running" | "succeeded" | "failed") {
  return {
    id,
    projectPath: "D:\\project",
    model: "deepseek-v4-flash",
    status,
    message: "run",
    createdAtMs: 1,
    updatedAtMs: 2,
    actionCount: 0,
    artifactCount: 0,
    eventCount: 0,
  };
}
