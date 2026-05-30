import test from "node:test";
import assert from "node:assert/strict";
import { buildCacheStabilityReport, formatCacheStabilityReport } from "./cacheStability.js";
import type { CachePromptPlan } from "./resonixPolicy.js";

test("cache stability report favors stable prefix-heavy plans", () => {
  const plan: CachePromptPlan = {
    userMessage: "",
    approxTokens: 200,
    droppedChars: 0,
    blocks: [
      { title: "pin:architecture", priority: "sticky", chars: 1200, truncated: false },
      { title: "project_memory", priority: "project", chars: 1500, truncated: false },
      { title: "selected_context", priority: "context", chars: 500, truncated: false },
      { title: "current_user_request", priority: "request", chars: 120, truncated: false },
    ],
  };

  const report = buildCacheStabilityReport(plan);
  assert.equal(report.risk, "low");
  assert.equal(report.stableTitles.length, 2);
  assert.match(formatCacheStabilityReport(report), /dynamicShare=15%/);
});

test("cache stability report warns when dynamic context is clipped", () => {
  const plan: CachePromptPlan = {
    userMessage: "",
    approxTokens: 900,
    droppedChars: 3000,
    blocks: [
      { title: "selected_context", priority: "context", chars: 4000, truncated: true },
      { title: "current_user_request", priority: "request", chars: 200, truncated: false },
    ],
  };

  const report = buildCacheStabilityReport(plan);
  assert.equal(report.risk, "high");
  assert.deepEqual(report.truncatedBlocks, ["selected_context"]);
  assert.match(report.recommendation, /cache pins/);
});

test("cache stability fingerprint ignores prompt body content", () => {
  const first: CachePromptPlan = {
    userMessage: "secret one",
    approxTokens: 10,
    droppedChars: 0,
    blocks: [{ title: "current_user_request", priority: "request", chars: 20, truncated: false }],
  };
  const second: CachePromptPlan = {
    userMessage: "secret two",
    approxTokens: 10,
    droppedChars: 0,
    blocks: [{ title: "current_user_request", priority: "request", chars: 20, truncated: false }],
  };

  assert.equal(buildCacheStabilityReport(first).shapeFingerprint, buildCacheStabilityReport(second).shapeFingerprint);
});
