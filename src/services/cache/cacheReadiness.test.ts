import test from "node:test";
import assert from "node:assert/strict";
import { buildCacheReadinessReport, formatCacheReadinessReport } from "./cacheReadiness.js";

test("cache readiness marks strong telemetry pins and repeated shapes as ready", () => {
  const report = buildCacheReadinessReport({
    telemetry: {
      hitTokens: 800,
      missTokens: 100,
      rate: "89%",
      observedRuns: 3,
    },
    pinAudit: {
      pinCount: 2,
      totalChars: 900,
      severity: "ok",
      items: [],
      recommendation: "Cache pins look healthy for a stable DeepSeek prefix.",
    },
    shapes: [{
      fingerprint: "shape-ready",
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:05:00.000Z",
      count: 3,
      risk: "low",
      stableChars: 1200,
      dynamicChars: 300,
      requestChars: 90,
      dynamicShare: 0.2,
      truncatedBlocks: [],
    }],
  });

  assert.equal(report.status, "ready");
  assert.ok(report.score >= 70);
  assert.match(formatCacheReadinessReport(report), /DeepSeek cache readiness: ready/);
  assert.match(report.recommendations[0] ?? "", /strong/);
});

test("cache readiness stays cold when pins and telemetry are missing", () => {
  const report = buildCacheReadinessReport({
    telemetry: {
      hitTokens: 0,
      missTokens: 0,
      rate: "n/a",
      observedRuns: 0,
    },
    pinAudit: {
      pinCount: 0,
      totalChars: 0,
      severity: "ok",
      items: [],
      recommendation: "No cache pins yet.",
    },
    shapes: [],
  });

  assert.equal(report.status, "cold");
  assert.match(report.recommendations.join("\n"), /cache pin apply/);
  assert.match(report.recommendations.join("\n"), /cache plan/);
});

test("cache readiness treats secret-like pin errors as cold", () => {
  const report = buildCacheReadinessReport({
    telemetry: {
      hitTokens: 900,
      missTokens: 0,
      rate: "100%",
      observedRuns: 2,
    },
    pinAudit: {
      pinCount: 1,
      totalChars: 200,
      severity: "error",
      items: [{
        pin: "secret",
        severity: "error",
        code: "pin-secret",
        message: "pin appears to contain an unredacted secret",
      }],
      recommendation: "Fix error pins before relying on cache reuse.",
    },
    shapes: [],
  });

  assert.equal(report.status, "cold");
  assert.match(report.recommendations.join("\n"), /cache pin audit/);
});
