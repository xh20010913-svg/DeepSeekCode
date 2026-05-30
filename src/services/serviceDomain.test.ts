import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ApprovalService } from "./approval/approvalService.js";
import { RunService } from "./runs/runService.js";
import { TaskService } from "./tasks/taskService.js";
import { StateStore } from "../state/sqlite.js";

test("domain services wrap state store operations", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-domain-"));
  const state = new StateStore(path.join(dataDir, "state.sqlite"));
  const runId = state.createRun({ projectPath: dataDir, model: "deepseek-v4-flash", message: "test" });
  state.createTask({ runId, agent: "Builder", title: "Build" });
  const runService = new RunService(state);
  const taskService = new TaskService(state);
  const approvalService = new ApprovalService(state);
  assert.equal(runService.latest()?.id, runId);
  assert.match(taskService.summarize(runId), /Builder/);
  const gateId = approvalService.request(runId, "review");
  assert.equal(approvalService.decide(gateId, "approved").status, "approved");
  state.close();
});
