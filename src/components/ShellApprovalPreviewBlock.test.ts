import test from "node:test";
import assert from "node:assert/strict";
import { shellApprovalPreviewModel } from "./ShellApprovalPreviewBlock.js";

test("shell approval preview summarizes local commands", () => {
  assert.deepEqual(shellApprovalPreviewModel("run_command command=npm.cmd run smoke cwd=."), {
    action: "run_command",
    title: "Shell command",
    command: "npm.cmd run smoke",
    targetLabel: "cwd",
    target: ".",
    risk: "medium",
    allowScope: "npm.cmd run smoke:*",
    note: "approve only if this exact command is expected",
  });
});

test("shell approval preview marks destructive commands high risk", () => {
  assert.equal(
    shellApprovalPreviewModel("run_command command=Remove-Item -Recurse -Force dist cwd=.")?.risk,
    "high",
  );
  assert.equal(shellApprovalPreviewModel("run_command command=git status cwd=.")?.risk, "low");
});

test("shell approval preview summarizes remote commands", () => {
  assert.deepEqual(shellApprovalPreviewModel("ssh_run profile=staging command=deploy --force"), {
    action: "ssh_run",
    title: "SSH command",
    command: "deploy --force",
    targetLabel: "profile",
    target: "staging",
    risk: "high",
    allowScope: "deploy --force:*",
    note: "remote shell execution needs explicit approval",
  });
});

test("shell approval preview ignores non-shell summaries", () => {
  assert.equal(shellApprovalPreviewModel("write_file path=note.txt overwrite=true chars=5"), null);
});
