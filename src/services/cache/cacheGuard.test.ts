import test from "node:test";
import assert from "node:assert/strict";
import { buildCacheGuardReport, formatCacheGuardReport } from "./cacheGuard.js";
import type { CachePreflightReport } from "./cachePreflight.js";
import type { CacheProfileForecast } from "./cacheProfiles.js";

function preflight(): CachePreflightReport {
  return {
    goal: "ship frontend cache work",
    effort: "low",
    status: "ready",
    planTokens: 1200,
    droppedChars: 0,
    truncatedBlocks: [],
    stabilityRisk: "low",
    dynamicShare: 0.25,
    shapeFingerprint: "shape-guard",
    shapeRepeat: "repeat=3",
    readinessScore: 86,
    readinessStatus: "ready",
    pinSeverity: "ok",
    pinCount: 3,
    pinIssues: 0,
    suggestionCount: 0,
    topSuggestions: [],
    recommendations: ["ready"],
    nextCommands: ["/cache plan ship frontend cache work"],
  };
}

function forecast(): CacheProfileForecast {
  return {
    goal: "ship frontend cache work",
    status: "strong",
    preflightStatus: "ready",
    currentTokens: 1200,
    stableTokens: 900,
    dynamicTokens: 300,
    profileStableTokens: 850,
    reusableTokens: 620,
    estimatedHitRate: 0.52,
    reason: "profile=frontend score=120",
    recommendations: ["run"],
    nextCommands: ["/cache profile auto ship frontend cache work"],
    profile: {
      name: "frontend",
      goal: "frontend cache",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      effort: "low",
      status: "ready",
      readinessScore: 90,
      readinessStatus: "ready",
      stabilityRisk: "low",
      dynamicShare: 0.2,
      shapeFingerprint: "shape-profile",
      shapeRepeat: "repeat=2",
      planTokens: 1100,
      droppedChars: 0,
      pinNames: ["readme"],
      recommendations: [],
      nextCommands: [],
    },
  };
}

test("cache guard allows strong ready profile reuse", () => {
  const report = buildCacheGuardReport({ preflight: preflight(), forecast: forecast() });
  assert.equal(report.decision, "run");
  assert.equal(report.profile, "frontend");
  assert.equal(report.blockers.length, 0);
  assert.equal(report.warnings.length, 0);
  assert.match(formatCacheGuardReport(report), /DeepSeek cache guard: run/);
});

test("cache guard asks to prepare weak profile reuse", () => {
  const weak = {
    ...forecast(),
    status: "warming" as const,
    reusableTokens: 180,
    estimatedHitRate: 0.15,
  };
  const report = buildCacheGuardReport({ preflight: preflight(), forecast: weak });
  assert.equal(report.decision, "prepare");
  assert.match(report.warnings.join("\n"), /forecast is warming/);
  assert.match(formatCacheGuardReport(report), /estimatedHit=15%/);
});

test("cache guard blocks failed preflight", () => {
  const blockedPreflight = {
    ...preflight(),
    status: "blocked" as const,
    pinSeverity: "error" as const,
  };
  const report = buildCacheGuardReport({
    preflight: blockedPreflight,
    forecast: { ...forecast(), status: "blocked" as const },
  });
  assert.equal(report.decision, "block");
  assert.match(report.blockers.join("\n"), /preflight is blocked/);
  assert.match(report.nextCommands.join("\n"), /cache pin audit/);
});
