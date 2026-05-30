import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { StateStore } from "./sqlite.js";

test("StateStore records runs, events, actions, and artifacts", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-state-"));
  const store = new StateStore(path.join(dir, "state.sqlite"));
  const runId = store.createRun({
    projectPath: dir,
    model: "deepseek-v4-flash",
    message: "test",
  });
  store.recordActionResults(runId, {
    final_message: "done",
    status: "succeeded",
    results: [
      {
        action_type: "write_file",
        status: "succeeded",
        path: "index.html",
        artifact_kind: "html",
      },
    ],
  });
  store.updateRunStatus(runId, "succeeded", "done");
  const run = store.listRuns(1)[0];
  assert.equal(run.id, runId);
  assert.equal(run.actionCount, 1);
  assert.equal(run.artifactCount, 1);
  assert.ok(store.listEvents(runId).length > 0);
  store.close();
});

test("StateStore records validation gates from validate_artifact actions", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-state-"));
  const store = new StateStore(path.join(dir, "state.sqlite"));
  const runId = store.createRun({
    projectPath: dir,
    model: "deepseek-v4-flash",
    message: "validate",
  });
  store.recordActionResults(runId, {
    final_message: "checked",
    status: "succeeded",
    results: [
      {
        action_type: "validate_artifact",
        status: "succeeded",
        path: "index.html",
        message: "ok",
        artifact_kind: "html",
      },
    ],
  });
  const gate = store.listValidationGates({ runId })[0];
  assert.equal(gate?.status, "passed");
  assert.equal(gate?.subjectId, "index.html");
  store.close();
});

test("StateStore persists UI focus state", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-state-"));
  const store = new StateStore(path.join(dir, "state.sqlite"));
  store.setUiState("tui", "selected_run", { id: "run_1" });
  assert.deepEqual(store.getUiState("tui", "selected_run"), { id: "run_1" });
  assert.equal(store.listUiState("tui")[0]?.key, "selected_run");
  store.deleteUiState("tui", "selected_run");
  assert.equal(store.getUiState("tui", "selected_run"), undefined);
  store.close();
});

test("StateStore summarizes persisted usage snapshots", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-state-"));
  const store = new StateStore(path.join(dir, "state.sqlite"));
  const runId = store.createRun({
    projectPath: dir,
    model: "deepseek-v4-flash",
    message: "usage",
  });
  store.recordUsage(runId, {
    inputTokens: 10,
    outputTokens: 3,
    cacheHitTokens: 7,
    cacheMissTokens: 3,
  }, "test");
  assert.equal(store.usageTotals().inputTokens, 10);
  assert.equal(store.usageTotals(runId).cacheHitTokens, 7);
  assert.equal(store.usageTotals("missing").snapshots, 0);
  store.close();
});
