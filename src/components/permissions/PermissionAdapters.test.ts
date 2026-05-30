import test from "node:test";
import assert from "node:assert/strict";
import { questionNavigationText } from "./AskUserQuestionPermissionRequest/QuestionNavigationBar.js";
import { submitQuestionsLabel } from "./AskUserQuestionPermissionRequest/SubmitQuestionsView.js";
import { useMultipleChoiceState } from "./AskUserQuestionPermissionRequest/use-multiple-choice-state.js";
import { bashToolUseOptions } from "./BashPermissionRequest/bashToolUseOptions.js";
import { filePermissionOptions } from "./FilePermissionDialog/permissionOptions.js";
import { ideDiffConfig } from "./FilePermissionDialog/ideDiffConfig.js";
import { addPermissionRuleOptions } from "./rules/AddPermissionRules.js";
import { addWorkspaceDirectoryText } from "./rules/AddWorkspaceDirectory.js";
import { normalizePermissionRuleInput } from "./rules/PermissionRuleInput.js";
import { permissionRuleListOptions } from "./rules/PermissionRuleList.js";
import { recentDenialsLabel } from "./rules/RecentDenialsTab.js";
import { removeWorkspaceDirectoryText } from "./rules/RemoveWorkspaceDirectory.js";
import { workspaceTabLabel } from "./rules/WorkspaceTab.js";
import { permissionDecisionDebugText } from "./PermissionDecisionDebugInfo.js";
import { permissionExplanationText } from "./PermissionExplanation.js";
import { permissionRequestTitle } from "./PermissionRequestTitle.js";
import { permissionRuleExplanation } from "./PermissionRuleExplanation.js";
import { shellCommandRisk, shellPermissionLabel } from "./shellPermissionHelpers.js";
import { permissionRiskTone, permissionSummary } from "./utils.js";
import { workerPendingPermissionText } from "./WorkerPendingPermission.js";

test("permission adapter helpers classify risk and labels", () => {
  assert.equal(permissionRiskTone("high"), "error");
  assert.equal(permissionSummary("write", "file"), "write | file");
  assert.equal(shellCommandRisk("rm -rf dist"), "high");
  assert.equal(shellPermissionLabel(false), "shell approval required");
});

test("permission adapter question helpers keep navigation state", () => {
  assert.equal(questionNavigationText(1, 3), "2/3");
  assert.equal(submitQuestionsLabel(1, 2), "1/2 answered");
  assert.deepEqual(useMultipleChoiceState(["a", "b"], ["b", "c"]), ["b"]);
});

test("permission adapter option helpers produce select rows", () => {
  assert.equal(bashToolUseOptions("npm test")[0]?.tone, "success");
  assert.equal(filePermissionOptions(true)[0]?.tone, "warning");
  assert.deepEqual(ideDiffConfig(true, "code").command, "code");
  assert.equal(addPermissionRuleOptions(["shell"])[0]?.label, "shell");
  assert.equal(permissionRuleListOptions(["shell:*"])[0]?.detail, "configured rule");
});

test("permission adapter text helpers summarize rule workflows", () => {
  assert.equal(addWorkspaceDirectoryText("D:\\code"), "add workspace: D:\\code");
  assert.equal(removeWorkspaceDirectoryText("D:\\code"), "remove workspace: D:\\code");
  assert.equal(normalizePermissionRuleInput(" shell   run "), "shell run");
  assert.equal(recentDenialsLabel(2), "2 recent denials");
  assert.equal(workspaceTabLabel(1), "1 workspace directory");
});

test("permission adapter display helpers reuse DeepSeekCode wording", () => {
  assert.equal(permissionDecisionDebugText("allow", "user"), "allow: user");
  assert.match(permissionExplanationText("shell"), /workspace/);
  assert.equal(permissionRequestTitle("Shell"), "Shell permission");
  assert.equal(permissionRuleExplanation("shell:*"), "Rule: shell:*");
  assert.match(workerPendingPermissionText("agent"), /waiting/);
});
