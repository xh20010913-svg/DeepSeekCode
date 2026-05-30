import test from "node:test";
import assert from "node:assert/strict";
import {
  isResumableRun,
  resumeTaskModel,
} from "./ResumeTask.js";
import type { RunRecord } from "../state/sqlite.js";

const baseRun: RunRecord = {
  id: "run_1",
  projectPath: "D:\\project",
  model: "deepseek-v4-flash",
  status: "running",
  message: "continue migration",
  createdAtMs: 1,
  updatedAtMs: Date.now(),
  actionCount: 2,
  artifactCount: 1,
  eventCount: 3,
  cacheHitTokens: 80,
  cacheMissTokens: 20,
};

test("resume task model lists resumable local runs first", () => {
  const model = resumeTaskModel([
    { ...baseRun, id: "done", status: "succeeded" },
    baseRun,
    { ...baseRun, id: "paused", status: "paused", message: "waiting" },
  ]);

  assert.equal(model.rows.length, 2);
  assert.equal(model.rows[0]?.runId, "run_1");
  assert.equal(model.rows[0]?.selected, true);
  assert.match(model.rows[0]?.detail ?? "", /cache=80%/);
  assert.match(model.summary, /2\/3 resumable/);
});

test("resume task model can focus a selected run", () => {
  const model = resumeTaskModel([
    baseRun,
    { ...baseRun, id: "run_2", status: "paused" },
  ], { selectedRunId: "run_2", visibleCount: 1 });

  assert.equal(model.rows[0]?.runId, "run_2");
  assert.equal(model.rows[0]?.selected, true);
});

test("resumable run detection excludes terminal states", () => {
  assert.equal(isResumableRun(baseRun), true);
  assert.equal(isResumableRun({ ...baseRun, status: "failed" }), false);
});
