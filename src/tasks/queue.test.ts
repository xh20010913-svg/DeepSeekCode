import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { StateStore } from "../state/sqlite.js";
import { DurableTaskQueue, createLinearTaskDag } from "./queue.js";
import { DurableTaskWorker } from "./worker.js";

test("DurableTaskQueue claims dependency-unblocked tasks in order", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-queue-"));
  const state = new StateStore(path.join(dir, "state.sqlite"));
  const runId = state.createRun({ projectPath: dir, model: "deepseek-v4-flash", message: "queue" });
  const [plannerId, builderId] = createLinearTaskDag(state, runId, [
    { agent: "Planner", title: "Plan" },
    { agent: "Builder", title: "Build" },
  ]);

  const queue = new DurableTaskQueue(state);
  assert.deepEqual(queue.runnable(runId).map((task) => task.id), [plannerId]);
  assert.equal(queue.claimNext(runId, "test")?.id, plannerId);
  assert.deepEqual(queue.runnable(runId).map((task) => task.id), []);
  queue.complete(plannerId, "plan ok");
  assert.deepEqual(queue.runnable(runId).map((task) => task.id), [builderId]);
  state.close();
});

test("DurableTaskWorker persists completion and failure outcomes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-worker-"));
  const state = new StateStore(path.join(dir, "state.sqlite"));
  const runId = state.createRun({ projectPath: dir, model: "deepseek-v4-flash", message: "worker" });
  const [firstId, secondId] = createLinearTaskDag(state, runId, [
    { agent: "Planner", title: "Plan" },
    { agent: "Builder", title: "Build" },
  ]);
  const worker = new DurableTaskWorker(state, "test-worker");

  const first = await worker.runOne(runId, () => "done");
  assert.equal(first.status, "completed");
  assert.equal(state.listTasks(runId).find((task) => task.id === firstId)?.status, "succeeded");

  const second = await worker.runOne(runId, () => {
    throw new Error("boom");
  });
  assert.equal(second.status, "failed");
  assert.equal(state.listTasks(runId).find((task) => task.id === secondId)?.status, "failed");
  state.close();
});
