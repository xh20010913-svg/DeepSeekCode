import test from "node:test";
import assert from "node:assert/strict";
import {
  queuePanelModel,
  runControlPanelModel,
  runPanelCommandOptions,
  runPanelRowOptions,
  runPanelTabs,
  runsPanelModel,
  tasksPanelModel,
} from "./RunPanel.js";

test("runs panel shows run status counts and cache rate", () => {
  const model = runsPanelModel([{
    id: "run_1",
    projectPath: "D:\\project",
    model: "deepseek",
    status: "succeeded",
    message: "finished",
    createdAtMs: 1,
    updatedAtMs: 1,
    actionCount: 2,
    artifactCount: 1,
    eventCount: 3,
    cacheHitTokens: 80,
    cacheMissTokens: 20,
  }]);

  assert.equal(model.rows[0]?.status, "succeeded");
  assert.equal(model.rows[0]?.tone, "success");
  assert.match(model.rows[0]?.note ?? "", /cache=80%/);
  assert.equal(model.summary.label, "1/1 done");
  assert.equal(model.summary.ratio, 1);
  assert.match(model.summary.detail, /cache=80%/);
  assert.equal(model.resumeTask?.rows.length, 0);
  assert.equal(runPanelTabs(model)[0]?.count, 1);
  assert.equal(runPanelCommandOptions(model)[0]?.id, "tasks");
});

test("tasks panel formats task agent and detail", () => {
  const model = tasksPanelModel("run_1", [{
    id: "task_1",
    runId: "run_1",
    parentTaskId: null,
    agent: "builder",
    title: "fix bug",
    status: "queued",
    detail: "waiting",
    createdAtMs: 1,
    updatedAtMs: 1,
  }]);

  assert.equal(model.rows[0]?.status, "queued");
  assert.match(model.rows[0]?.detail ?? "", /builder: fix bug/);
  assert.match(model.rows[0]?.note ?? "", /waiting/);
  assert.equal(model.summary.label, "0/1 done");
  assert.equal(model.summary.tone, "warning");
  assert.equal(runPanelRowOptions(model)[0]?.label, "task_1");
});

test("queue panel marks runnable tasks and dependencies", () => {
  const model = queuePanelModel({
    runId: "run_1",
    tasks: [{
      id: "task_2",
      runId: "run_1",
      parentTaskId: null,
      agent: "tester",
      title: "run tests",
      status: "queued",
      detail: "queued",
      createdAtMs: 1,
      updatedAtMs: 1,
    }],
    runnableIds: new Set(["task_2"]),
    dependenciesByTaskId: new Map([["task_2", ["task_1"]]]),
  });

  assert.equal(model.rows[0]?.status, "runnable");
  assert.equal(model.rows[0]?.tone, "success");
  assert.equal(model.summary.detail, "running=0 runnable=1 blocked=1");
  assert.match(model.summary.badges[0]?.label ?? "", /runnable 1/);
  assert.equal(runPanelCommandOptions(model)[0]?.id, "step");
  assert.match(model.rows[0]?.note ?? "", /deps=task_1/);
});

test("run control panel summarizes updated run state", () => {
  const model = runControlPanelModel({
    runId: "run_1",
    action: "paused",
    reason: "wait",
    run: {
      id: "run_1",
      projectPath: "D:\\project",
      model: "deepseek-v4-flash",
      status: "paused",
      message: "wait",
      createdAtMs: 1,
      updatedAtMs: 2,
      actionCount: 1,
      artifactCount: 0,
      eventCount: 2,
    },
  });

  assert.equal(model.rows[0]?.status, "paused");
  assert.equal(model.rows[0]?.tone, "warning");
  assert.equal(model.summary.label, "0/1 done");
  assert.equal(runPanelCommandOptions(model)[0]?.id, "trace");
  assert.match(model.rows[0]?.note ?? "", /reason=wait/);
});
