import test from "node:test";
import assert from "node:assert/strict";
import { runtimeEventsPanelModel, runtimeLogsPanelModel, runtimeTracePanelModel } from "./RuntimePanel.js";

test("runtime logs panel highlights warnings and errors", () => {
  const model = runtimeLogsPanelModel([
    { level: "info", message: "started", createdAtMs: 1 },
    { level: "warn", message: "slow hook", metadata: { hook: "pre" }, createdAtMs: 2 },
    { level: "error", message: "tool failed", metadata: { code: 1 }, createdAtMs: 3 },
  ]);

  assert.equal(model.badge, "errors");
  assert.equal(model.badgeTone, "error");
  assert.equal(model.selector?.rows.find((row) => row.selected)?.level, "error");
  assert.equal(model.rows[1]?.tone, "warning");
  assert.match(model.rows[2]?.detail ?? "", /"code":1/);
});

test("runtime events panel keeps run scope and event payload", () => {
  const model = runtimeEventsPanelModel([
    {
      id: 7,
      runId: "run_1",
      kind: "task_created",
      payload: { task: "builder" },
      createdAtMs: 10,
    },
  ], "run_1");

  assert.equal(model.badge, "1");
  assert.match(model.subtitle, /scope=run_1/);
  assert.equal(model.rows[0]?.tone, "success");
  assert.match(model.rows[0]?.detail ?? "", /builder/);
});

test("runtime trace panel summarizes run tasks actions artifacts and events", () => {
  const model = runtimeTracePanelModel("run_1", {
    run: {
      id: "run_1",
      status: "running",
      model: "deepseek-v4-flash",
      message: "working",
      updatedAtMs: 20,
    },
    tasks: [{
      id: "task_1",
      status: "queued",
      agent: "Builder",
      title: "Implement panel",
      detail: "waiting",
      updatedAtMs: 21,
    }],
    actions: [{
      step_index: 1,
      action_type: "write_file",
      status: "succeeded",
      path: "src/file.ts",
      message: "wrote file",
      created_at_ms: 22,
    }],
    artifacts: [{
      kind: "report",
      path: "exports/run.md",
      created_at_ms: 23,
    }],
    events: [{
      id: 9,
      runId: "run_1",
      kind: "action_completed",
      payload: { action: "write_file" },
      createdAtMs: 24,
    }],
  });

  assert.equal(model.badge, "running");
  assert.match(model.subtitle, /tasks=1 actions=1 artifacts=1 events=1/);
  assert.equal(model.rows.some((row) => row.title === "task task_1"), true);
  assert.equal(model.rows.some((row) => row.detail.includes("write_file")), true);
  assert.equal(model.rows.some((row) => row.detail.includes("exports/run.md")), true);
});
