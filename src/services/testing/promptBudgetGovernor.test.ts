import assert from "node:assert/strict";
import test from "node:test";
import { buildPromptBudgetPlan, formatPromptBudgetPlan } from "../context/promptBudgetGovernor.js";

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
