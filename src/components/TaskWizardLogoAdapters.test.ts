import test from "node:test";
import assert from "node:assert/strict";
import { backgroundTaskSummary } from "./tasks/BackgroundTask.js";
import { taskStatusLabel, taskStatusTone } from "./tasks/taskStatusUtils.js";
import { teamStatusLabel } from "./teams/TeamStatus.js";
import { trustModeLabel } from "./TrustDialog/utils.js";
import { useWizard } from "./wizard/useWizard.js";
import { wizardNavigationText } from "./wizard/WizardNavigationFooter.js";
import { feedConfigs } from "./LogoV2/feedConfigs.js";

test("task and team adapters summarize local background work", () => {
  assert.equal(taskStatusTone("completed"), "success");
  assert.equal(taskStatusLabel("queued"), "queued");
  assert.equal(backgroundTaskSummary("task-1", "running"), "task-1 | running");
  assert.equal(teamStatusLabel(2, 3), "2/3 active");
});

test("trust and wizard adapters track simple wizard state", () => {
  assert.equal(trustModeLabel(false), "review workspace trust");
  assert.equal(useWizard([{ id: "a", title: "A" }], "a").activeIndex, 0);
  assert.match(wizardNavigationText(0, 2), /enter next/);
});

test("logo feed config exposes DeepSeekCode startup hints", () => {
  assert.deepEqual([...feedConfigs], ["cache", "agents", "tools"]);
});
