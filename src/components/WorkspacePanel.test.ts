import test from "node:test";
import assert from "node:assert/strict";
import {
  attachActionPanelModel,
  attachCurrentPanelModel,
  attachListPanelModel,
  checkpointCreatedPanelModel,
  checkpointDiffPanelModel,
  checkpointListPanelModel,
  checkpointRestorePanelModel,
  workspacePanelCommandOptions,
  workspacePanelRowOptions,
  workspacePanelTabs,
} from "./WorkspacePanel.js";
import type { RunRecord } from "../state/sqlite.js";
import type { WorkspaceCheckpoint } from "../services/rewind/workspaceCheckpointService.js";

const run: RunRecord = {
  id: "run_1",
  projectPath: "D:\\project",
  model: "deepseek-v4-flash",
  status: "running",
  message: "Working on UI",
  createdAtMs: 1,
  updatedAtMs: 2,
  actionCount: 3,
  artifactCount: 1,
  eventCount: 4,
};

const checkpoint: WorkspaceCheckpoint = {
  id: "chk_1",
  label: "before change",
  projectPath: "D:\\project",
  createdAtMs: 1,
  fileCount: 2,
  totalBytes: 40,
  truncated: false,
  files: [
    { path: "src/a.ts", content: "a", size: 10, sha256: "abcdef1234567890" },
    { path: "src/b.ts", content: "b", size: 30, sha256: "123456abcdef7890" },
  ],
};

test("checkpoint list and detail models summarize checkpoint state", () => {
  const list = checkpointListPanelModel([checkpoint], "D:\\project\\.deepseekcode\\checkpoints");
  assert.equal(list.badge, "1");
  assert.equal(list.rows[0]?.label, "complete");
  assert.equal(workspacePanelTabs(list)[0]?.count, 1);
  assert.equal(workspacePanelCommandOptions(list)[0]?.id, "show");
  assert.equal(workspacePanelRowOptions(list)[0]?.detail, "chk_1");

  const detail = checkpointCreatedPanelModel(checkpoint);
  assert.equal(detail.title, "Checkpoint created");
  assert.equal(detail.badgeTone, "success");
  assert.equal(detail.rows.some((row) => row.value === "src/a.ts"), true);
});

test("checkpoint diff and restore models expose safety counts", () => {
  const diff = checkpointDiffPanelModel("chk_1", {
    changed: 1,
    added: 1,
    removed: 0,
    diff: "file src/a.ts +1 -0\n+new line",
  });
  assert.equal(diff.badge, "changed");
  assert.equal(diff.rows.some((row) => row.label === "add"), true);
  assert.equal(workspacePanelCommandOptions(diff)[0]?.id, "restore");

  const restore = checkpointRestorePanelModel("chk_1", {
    restored: 2,
    deleted: 1,
    skipped: 3,
  }, true);
  assert.equal(restore.badge, "restored");
  assert.equal(restore.rows.find((row) => row.key === "deleted")?.tone, "warning");
  assert.equal(workspacePanelCommandOptions(restore)[0]?.id, "diff");
});

test("attach models mark current attached run and cleared state", () => {
  const list = attachListPanelModel([run], "run_1");
  assert.equal(list.rows[0]?.label, "current");
  assert.equal(list.rows[0]?.tone, "success");
  assert.equal(workspacePanelCommandOptions(list)[0]?.id, "latest");

  const current = attachCurrentPanelModel({ runId: "run_1", run });
  assert.equal(current.badge, "running");
  assert.match(current.footer, /trace attached/);
  assert.equal(workspacePanelCommandOptions(current)[0]?.id, "tasks");

  const attached = attachActionPanelModel(run, "attached");
  assert.equal(attached.badgeTone, "success");

  const none = attachCurrentPanelModel({});
  assert.equal(none.badge, "none");
});
