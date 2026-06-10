import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPromptBudgetPlan,
  formatPromptBudgetPlan,
  planProviderPrompt,
  shouldAutoCompactPrompt,
} from "../context/promptBudgetGovernor.js";

test("prompt budget keeps current request and trims low priority dynamic context", () => {
  const plan = buildPromptBudgetPlan({
    stableHash: "stable-abc",
    maxDynamicChars: 120,
    phase: "unit",
    blocks: [
      { title: "stable_policy", priority: "sticky", body: "stable rules" },
      { title: "selected_context", priority: "context", body: "x".repeat(500) },
      { title: "tool_feedback", priority: "feedback", body: "last command failed" },
      { title: "current_request", priority: "request", body: "repair the PDF verifier" },
    ],
  });

  assert.match(plan.userMessage, /repair the PDF verifier/);
  assert.equal(plan.stableHash, "stable-abc");
  assert.ok(plan.droppedChars > 0);
  assert.ok(plan.droppedBlocks.includes("selected_context"));
  assert.ok(plan.dynamicHash.length > 0);
  assert.match(formatPromptBudgetPlan(plan), /stableHash=stable-abc/);
});

test("prompt budget preserves deterministic block order for cacheable prompts", () => {
  const first = buildPromptBudgetPlan({
    maxDynamicChars: 1000,
    blocks: [
      { title: "current_request", priority: "request", body: "do the thing" },
      { title: "stable_policy", priority: "sticky", body: "policy" },
      { title: "project_index", priority: "project", body: "index" },
    ],
  });
  const second = buildPromptBudgetPlan({
    maxDynamicChars: 1000,
    blocks: [
      { title: "project_index", priority: "project", body: "index" },
      { title: "current_request", priority: "request", body: "do the thing" },
      { title: "stable_policy", priority: "sticky", body: "policy" },
    ],
  });

  assert.equal(first.userMessage, second.userMessage);
  assert.equal(first.dynamicHash, second.dynamicHash);
});

test("provider prompt planning records budget identity and compact pressure", () => {
  const planned = planProviderPrompt({
    provider: "deepseek",
    runId: "run_budget_test",
    callSite: "role_runner",
    phase: "execution",
    maxDynamicChars: 100,
    stablePrefix: "DeepSeekCode stable kernel policy",
    blocks: [
      { title: "project_index", priority: "project", body: "p".repeat(120) },
      { title: "tool_feedback", priority: "feedback", body: "f".repeat(120) },
      { title: "current_request", priority: "request", body: "finish the task" },
    ],
  });

  assert.ok(planned.plan.budgetPlanId.startsWith("budget_"));
  assert.ok(planned.plan.diagnostics.shouldCompact);
  assert.equal(planned.messages[0]?.role, "system");
  assert.equal(planned.messages[1]?.role, "user");
  assert.equal(shouldAutoCompactPrompt(planned.plan), true);
});
