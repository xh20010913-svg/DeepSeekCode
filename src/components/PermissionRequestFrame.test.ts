import test from "node:test";
import assert from "node:assert/strict";
import { permissionRequestFrameModel } from "./PermissionRequestFrame.js";
import type { ApprovalGateRecord } from "../state/sqlite.js";

function gate(input: Partial<ApprovalGateRecord>): ApprovalGateRecord {
  return {
    id: "approval_1",
    runId: "run_1",
    subjectType: "tool_action",
    subjectId: "subject_1",
    status: "pending",
    summary: "run_command command=npm.cmd run smoke cwd=.",
    rationale: "",
    createdAtMs: 1,
    updatedAtMs: 1,
    ...input,
  };
}

test("permission request frame models shell commands", () => {
  assert.deepEqual(permissionRequestFrameModel(gate({})), {
    title: "DeepSeekCode wants to run a command",
    subtitle: "npm.cmd run smoke",
    scope: "cwd .",
    risk: "medium",
    tone: "brand",
    titleColor: "cyan",
    statusLabel: "pending",
  });
});

test("permission request frame elevates destructive edits", () => {
  assert.deepEqual(permissionRequestFrameModel(gate({
    summary: "apply_patch path=src/app.ts edits=2 projected=ok added=4 removed=1",
  })), {
    title: "DeepSeekCode wants to apply a patch",
    subtitle: "src/app.ts",
    scope: "2 search/replace edit(s)",
    risk: "high",
    tone: "warning",
    titleColor: "yellow",
    statusLabel: "pending",
  });
});

test("permission request frame covers question gates", () => {
  assert.equal(permissionRequestFrameModel(gate({
    subjectType: "question",
    summary: "Question for user: Goal: Choose next step",
  })).title, "DeepSeekCode needs your answer");
});
