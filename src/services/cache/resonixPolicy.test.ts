import test from "node:test";
import assert from "node:assert/strict";
import { buildResonixPromptPlan } from "./resonixPolicy.js";

test("Resonix prompt plan preserves latest request while trimming older context", () => {
  const plan = buildResonixPromptPlan([
    { title: "project_memory", body: "memory".repeat(100), priority: "project" },
    { title: "selected_context", body: "context".repeat(1000), priority: "context" },
    { title: "current_user_request", body: "please implement the feature", priority: "request" },
  ], { maxDynamicChars: 500 });

  assert.match(plan.userMessage, /please implement the feature/);
  assert.ok(plan.droppedChars > 0);
  assert.ok(plan.blocks.some((block) => block.title === "selected_context" && block.truncated));
});
