import test from "node:test";
import assert from "node:assert/strict";
import { buildCachePreflightReport, formatCachePreflightReport } from "./cachePreflight.js";

type CachePreflightInput = Parameters<typeof buildCachePreflightReport>[0];

function baseInput(): CachePreflightInput {
  return {
    goal: "improve cache behavior",
    effort: "low",
    plan: {
      userMessage: "prompt",
      approxTokens: 500,
      droppedChars: 0,
      blocks: [{
        title: "cache_pin_readme",
        priority: "sticky" as const,
        chars: 600,
        truncated: false,
      }, {
        title: "current_user_request",
        priority: "request" as const,
        chars: 80,
        truncated: false,
      }],
    },
    stability: {
      risk: "low" as const,
      shapeFingerprint: "shape-ready",
      stableChars: 600,
      dynamicChars: 0,
      requestChars: 80,
      dynamicShare: 0,
      truncatedBlocks: [],
      stableTitles: ["cache_pin_readme"],
      recommendation: "Stable prefix looks healthy.",
    },
    shapeObservation: {
      record: {
        fingerprint: "shape-ready",
        firstSeenAt: "2026-01-01T00:00:00.000Z",
        lastSeenAt: "2026-01-01T00:05:00.000Z",
        count: 2,
        risk: "low" as const,
        stableChars: 600,
        dynamicChars: 0,
        requestChars: 80,
        dynamicShare: 0,
        truncatedBlocks: [],
      },
      previousCount: 1,
      repeated: true,
      totalShapes: 1,
    },
    readiness: {
      score: 82,
      status: "ready" as const,
      telemetry: {
        hitTokens: 800,
        missTokens: 100,
        rate: "89%",
        observedRuns: 3,
      },
      pinSeverity: "ok" as const,
      pinCount: 2,
      pinIssues: 0,
      totalPinChars: 900,
      totalShapes: 1,
      repeatedShapes: 1,
      riskyShapes: 0,
      latestShape: "shape-ready",
      recommendations: ["Cache readiness looks strong."],
    },
    pinAudit: {
      pinCount: 2,
      totalChars: 900,
      severity: "ok" as const,
      items: [],
      recommendation: "Cache pins look healthy.",
    },
    suggestions: [],
  };
}

test("cache preflight reports ready when stability and readiness are healthy", () => {
  const report = buildCachePreflightReport(baseInput());
  assert.equal(report.status, "ready");
  assert.equal(report.shapeRepeat, "repeat=2");
  assert.match(formatCachePreflightReport(report), /DeepSeek cache preflight: ready/);
  assert.match(report.recommendations[0] ?? "", /Preflight looks ready/);
  assert.deepEqual(report.nextCommands, ["/cache plan improve cache behavior"]);
  assert.match(formatCachePreflightReport(report), /next commands:/);
});

test("cache preflight asks for review when prompt blocks are truncated", () => {
  const input = baseInput();
  input.plan.droppedChars = 120;
  input.plan.blocks[0] = { ...input.plan.blocks[0], truncated: true };
  input.stability = {
    ...input.stability,
    risk: "high",
    truncatedBlocks: ["cache_pin_readme"],
    dynamicShare: 0.7,
  };
  const report = buildCachePreflightReport(input);
  assert.equal(report.status, "review");
  assert.match(report.recommendations.join("\n"), /Narrow selected files/);
  assert.deepEqual(report.nextCommands, [
    "/cache plan improve cache behavior",
    "/cache doctor",
  ]);
});

test("cache preflight blocks when cache pin audit has errors", () => {
  const input = baseInput();
  input.pinAudit = {
    pinCount: 1,
    totalChars: 100,
    severity: "error",
    items: [{
      pin: "secret",
      severity: "error",
      code: "pin-secret",
      message: "pin appears to contain an unredacted secret",
    }],
    recommendation: "Fix error pins.",
  };
  const report = buildCachePreflightReport(input);
  assert.equal(report.status, "blocked");
  assert.match(report.recommendations.join("\n"), /Fix cache pin audit errors/);
  assert.deepEqual(report.nextCommands, [
    "/cache pin audit",
    "/cache doctor",
  ]);
});
