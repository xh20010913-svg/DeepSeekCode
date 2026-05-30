import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { StateStore } from "../../state/sqlite.js";
import { PlanModeService, formatPlanStatus } from "./planModeService.js";

test("PlanModeService writes plans and requests durable approval", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-plan-"));
  const state = new StateStore(path.join(root, "state.sqlite"));
  const runId = state.createRun({
    projectPath: root,
    model: "deepseek-v4-flash",
    message: "plan service",
  });
  const service = new PlanModeService(root, state);

  const draft = service.enter(runId, "Add plan mode");
  assert.match(draft.content, /Goal: Add plan mode/);
  assert.equal(fs.existsSync(draft.path), true);
  assert.equal(service.currentRunId(), runId);

  const exited = service.exit(runId, "## Plan\n1. Build it\n", "Approve plan mode");
  assert.equal(exited.gate?.status, "pending");
  assert.equal(state.getRun(runId)?.status, "paused");
  assert.match(formatPlanStatus(exited), /approval_/);
  state.close();
});
