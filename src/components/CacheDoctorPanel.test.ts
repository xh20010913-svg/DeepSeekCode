import test from "node:test";
import assert from "node:assert/strict";
import { buildCacheDoctorPanelModel } from "./CacheDoctorPanel.js";

test("cache doctor panel marks drift and low-cache runs for review", () => {
  const model = buildCacheDoctorPanelModel({
    scope: "all",
    usage: {
      inputTokens: 100,
      outputTokens: 20,
      cacheHitTokens: 30,
      cacheMissTokens: 70,
      snapshots: 2,
    },
    runs: [{
      id: "run_1",
      status: "completed",
      message: "large edit",
      cacheHitTokens: 20,
      cacheMissTokens: 80,
      cacheRate: "20%",
    }],
    observedRuns: 1,
    prefixStableEvents: 1,
    prefixDriftEvents: 1,
    promptPlans: 2,
    highDynamicPlans: 1,
    droppedChars: 300,
    guardEvents: 1,
    guardRun: 0,
    guardPrepare: 1,
    guardBlock: 0,
    guardRows: [{
      runId: "run_1",
      decision: "prepare",
      profile: "frontend",
      estimatedHitRate: 0.24,
      stableTokens: 700,
      dynamicTokens: 900,
      reusableTokens: 220,
      blockers: [],
      warnings: ["estimated cache hit below 35%"],
      message: "large edit",
    }],
    recommendations: ["Use /cache plan <goal> before large tasks."],
  });

  assert.equal(model.badge, "review");
  assert.match(model.summary, /prepare=1/);
  assert.ok(model.rows.some((row) => row.label === "guard"));
  assert.ok(model.rows.some((row) => row.label === "prep" && row.name === "run_1"));
  assert.ok(model.rows.some((row) => row.label === "low" && row.name === "run_1"));
  assert.ok(model.rows.some((row) => row.label === "rec"));
});

test("cache doctor panel has an empty telemetry state", () => {
  const model = buildCacheDoctorPanelModel({
    scope: "all",
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheHitTokens: 0,
      cacheMissTokens: 0,
      snapshots: 0,
    },
    runs: [],
    observedRuns: 0,
    prefixStableEvents: 0,
    prefixDriftEvents: 0,
    promptPlans: 0,
    highDynamicPlans: 0,
    droppedChars: 0,
    guardEvents: 0,
    guardRun: 0,
    guardPrepare: 0,
    guardBlock: 0,
    guardRows: [],
    recommendations: ["Run a tool-backed request first."],
  });

  assert.equal(model.badge, "empty");
  assert.equal(model.rows[0]?.label, "use");
  assert.match(model.footer, /cache guard/);
});
