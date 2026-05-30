import test from "node:test";
import assert from "node:assert/strict";
import { attachedRunPanelModel } from "./AttachedRunPanel.js";

test("attached run panel model handles empty focus", () => {
  const model = attachedRunPanelModel();

  assert.equal(model.state, "none");
  assert.equal(model.status, "none");
  assert.equal(model.command, "/attach list");
});

test("attached run panel model reports missing attached runs", () => {
  const model = attachedRunPanelModel(undefined, "run_missing");

  assert.equal(model.state, "missing");
  assert.equal(model.tone, "warning");
  assert.equal(model.command, "/attach clear");
});

test("attached run panel model summarizes an attached run", () => {
  const model = attachedRunPanelModel({
    id: "run_123456789",
    projectPath: "D:\\project",
    model: "deepseek-v4-flash",
    status: "running",
    message: "agent:builder fix the UI",
    createdAtMs: 1,
    updatedAtMs: 2,
    actionCount: 4,
    artifactCount: 1,
    eventCount: 7,
  }, "run_123456789");

  assert.equal(model.state, "attached");
  assert.equal(model.status, "running");
  assert.equal(model.tone, "warning");
  assert.match(model.detail, /4 actions/);
  assert.match(model.command, /agent:builder/);
});
