import test from "node:test";
import assert from "node:assert/strict";
import { antModelSwitchMessage } from "./AntModelSwitchCallout.js";
import { costThresholdTone } from "./CostThresholdDialog.js";
import { devBarText } from "./DevBar.js";
import { exitFlowMessage } from "./ExitFlow.js";
import { exportDialogTitle } from "./ExportDialog.js";
import { languagePickerOptions } from "./LanguagePicker.js";
import { messageActionOptions } from "./messageActions.js";
import { messageLabel } from "./Message.js";
import { outputStylePickerOptions } from "./OutputStylePicker.js";
import { prBadgeLabel } from "./PrBadge.js";
import { remoteCalloutSummary } from "./RemoteCallout.js";
import { sandboxViolationLines } from "./SandboxViolationExpandedView.js";
import { scrollKeybindingDelta } from "./ScrollKeybindingHandler.js";
import { sessionBackgroundHintModel } from "./SessionBackgroundHint.js";
import { structuredDiffListModel } from "./StructuredDiffList.js";
import { thinkingToggleLabel } from "./ThinkingToggle.js";
import { undercoverAutoLabel } from "./UndercoverAutoCallout.js";

test("top level message and action adapters expose existing transcript semantics", () => {
  assert.equal(messageLabel({ role: "assistant", text: "ok" }), "DeepSeekCode");
  assert.equal(messageActionOptions({ role: "user", text: "retry this" }).find((item) => item.id === "retry")?.disabled, false);
});

test("top level picker and badge helpers are stable", () => {
  assert.equal(languagePickerOptions("zh-CN").find((item) => item.id === "zh-CN")?.selected, true);
  assert.equal(outputStylePickerOptions(["deepseek", "reviewer"], "reviewer")[1]?.selected, true);
  assert.equal(prBadgeLabel("#12"), "PR #12");
});

test("top level callout models summarize risk and status", () => {
  assert.equal(costThresholdTone(8, 10), "warning");
  assert.match(devBarText({ version: "0.1.0", model: "deepseek-v4-flash", cacheRate: "90%" }), /cache 90%/);
  assert.match(exitFlowMessage(true), /unfinished/);
  assert.equal(exportDialogTitle("run"), "Export run");
  assert.match(remoteCalloutSummary({ profile: "prod", remotePath: "/srv/app", shellEnabled: false }), /approval/);
  assert.deepEqual(sandboxViolationLines("a\n\nb"), ["a", "b"]);
});

test("top level utility adapters keep terminal behavior explicit", () => {
  assert.equal(scrollKeybindingDelta("pagedown"), 10);
  assert.match(sessionBackgroundHintModel({ hasTranscript: false, hasAttachedRun: false, providerReady: true }), /cache plan/);
  assert.equal(thinkingToggleLabel(false), "thinking compact");
  assert.equal(undercoverAutoLabel(true), "auto mode on");
  assert.equal(antModelSwitchMessage("deepseek-v4-flash").includes("cheap"), true);
});

test("structured diff list model detects unified diff", () => {
  const model = structuredDiffListModel("--- a\n+++ b\n@@ -1 +1 @@\n-a\n+b", 3);

  assert.equal(model.isDiff, true);
  assert.equal(model.hidden, 2);
});
