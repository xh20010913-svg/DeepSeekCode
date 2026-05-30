import test from "node:test";
import assert from "node:assert/strict";
import { buildCacheGuardPanelModel } from "./CacheGuardPanel.js";

test("cache guard panel summarizes run decision", () => {
  const model = buildCacheGuardPanelModel({
    goal: "ship frontend cache work",
    decision: "run",
    profile: "frontend",
    preflightStatus: "ready",
    forecastStatus: "strong",
    readinessScore: 86,
    estimatedHitRate: 0.52,
    stableTokens: 900,
    dynamicTokens: 300,
    reusableTokens: 620,
    blockers: [],
    warnings: [],
    recommendations: ["Cache shape looks ready."],
    nextCommands: ["/cache preflight ship frontend cache work"],
  });

  assert.equal(model.title, "DeepSeek cache guard");
  assert.equal(model.badge, "run");
  assert.equal(model.badgeTone, "success");
  assert.equal(model.ratio, 0.52);
  assert.match(model.summary, /profile=frontend/);
  assert.match(model.rows[1]?.detail ?? "", /reusable~620/);
});

test("cache guard panel surfaces blockers and warnings", () => {
  const model = buildCacheGuardPanelModel({
    goal: "ship frontend cache work",
    decision: "block",
    profile: "none",
    preflightStatus: "blocked",
    forecastStatus: "blocked",
    readinessScore: 12,
    estimatedHitRate: 0,
    stableTokens: 0,
    dynamicTokens: 1000,
    reusableTokens: 0,
    blockers: ["preflight is blocked"],
    warnings: ["dynamic prompt share is high"],
    recommendations: ["Fix cache issues."],
    nextCommands: ["/cache pin audit"],
  });

  assert.equal(model.badge, "block");
  assert.equal(model.badgeTone, "error");
  assert.ok(model.rows.some((row) => row.label === "block"));
  assert.ok(model.rows.some((row) => row.label === "warn"));
  assert.match(model.footer, /cache pin audit/);
});
