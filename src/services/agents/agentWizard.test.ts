import test from "node:test";
import assert from "node:assert/strict";
import { buildAgentWizardPlan, formatAgentWizardPlan } from "./agentWizard.js";

test("agent wizard suggests conservative read-only agents by default", () => {
  const plan = buildAgentWizardPlan({ goal: "review architecture decisions" });
  assert.equal(plan.tools.includes("read_file"), true);
  assert.equal(plan.tools.includes("grep_files"), true);
  assert.equal(plan.tools.includes("run_command"), false);
  assert.equal(plan.disallowedTools.includes("run_command"), true);
  assert.equal(plan.maxTurns, 2);
  assert.match(formatAgentWizardPlan(plan), /rationale:/);
});

test("agent wizard adds write, validation, test, and browser tools from goal hints", () => {
  const plan = buildAgentWizardPlan({
    name: "UI Fixer",
    goal: "fix frontend UI and run tests",
  });
  assert.equal(plan.name, "ui-fixer");
  assert.equal(plan.tools.includes("write_file"), true);
  assert.equal(plan.tools.includes("apply_patch"), true);
  assert.equal(plan.tools.includes("validate_artifact"), true);
  assert.equal(plan.tools.includes("run_command"), true);
  assert.equal(plan.tools.includes("browser_snapshot"), true);
  assert.equal(plan.disallowedTools.includes("run_command"), false);
  assert.equal(plan.maxTurns, 3);
});
