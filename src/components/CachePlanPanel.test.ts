import test from "node:test";
import assert from "node:assert/strict";
import { buildCachePlanPanelModel } from "./CachePlanPanel.js";
import type { CachePromptPlan } from "../services/cache/resonixPolicy.js";

test("cache plan panel model keeps request visible and labels stable prefix blocks", () => {
  const plan: CachePromptPlan = {
    userMessage: "",
    approxTokens: 120,
    droppedChars: 0,
    blocks: [
      { title: "project_memory", priority: "project", chars: 20, truncated: false },
      { title: "selected_context", priority: "context", chars: 40, truncated: false },
      { title: "current_user_request", priority: "request", chars: 10, truncated: false },
    ],
  };

  const model = buildCachePlanPanelModel({
    goal: "refactor cache panel",
    effort: "medium",
    plan,
    maxDynamicChars: 100,
  });

  assert.equal(model.badge, "medium");
  assert.equal(model.ratio, 0.7);
  assert.equal(model.rows[0]?.label, "project");
  assert.equal(model.rows[2]?.label, "request");
  assert.equal(model.stabilityBadge, "medium");
  assert.match(model.stabilitySummary, /shape=/);
  assert.match(model.shapeNote, /content-free/);
  assert.match(model.recommendation, /stable/);
});

test("cache plan panel model warns when dynamic context is clipped", () => {
  const plan: CachePromptPlan = {
    userMessage: "",
    approxTokens: 400,
    droppedChars: 1200,
    blocks: [
      { title: "selected_context", priority: "context", chars: 100, truncated: true },
      { title: "current_user_request", priority: "request", chars: 25, truncated: false },
    ],
  };

  const model = buildCachePlanPanelModel({
    goal: "large migration",
    effort: "low",
    plan,
    maxDynamicChars: 100,
    shapeNote: "shapeSeen=repeat=2 shape=abc risk=high tracked=1",
  });

  assert.equal(model.rows[0]?.tone, "warning");
  assert.equal(model.stabilityBadge, "high");
  assert.equal(model.stabilityTone, "error");
  assert.match(model.shapeNote, /repeat=2/);
  assert.match(model.rows[0]?.note ?? "", /truncated/);
  assert.match(model.recommendation, /clipped/);
});
