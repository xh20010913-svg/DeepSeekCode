import test from "node:test";
import assert from "node:assert/strict";
import { buildCacheReadinessPanelModel } from "./CacheReadinessPanel.js";

test("cache readiness panel summarizes score telemetry pins and shapes", () => {
  const model = buildCacheReadinessPanelModel({
    score: 82,
    status: "ready",
    telemetry: {
      hitTokens: 600,
      missTokens: 100,
      rate: "86%",
      observedRuns: 4,
    },
    pinSeverity: "ok",
    pinCount: 3,
    pinIssues: 0,
    totalPinChars: 1200,
    totalShapes: 2,
    repeatedShapes: 1,
    riskyShapes: 0,
    latestShape: "shape-1",
    recommendations: ["Cache readiness looks strong; keep stable blocks first."],
  });

  assert.equal(model.badge, "ready");
  assert.equal(model.ratio, 0.82);
  assert.match(model.summary, /score=82/);
  assert.deepEqual(model.rows.slice(0, 3).map((row) => row.label), ["hit", "pin", "shape"]);
  assert.match(model.footer, /cache doctor/);
});

test("cache readiness panel marks cold reports as muted", () => {
  const model = buildCacheReadinessPanelModel({
    score: 5,
    status: "cold",
    telemetry: {
      hitTokens: 0,
      missTokens: 0,
      rate: "n/a",
      observedRuns: 0,
    },
    pinSeverity: "ok",
    pinCount: 0,
    pinIssues: 0,
    totalPinChars: 0,
    totalShapes: 0,
    repeatedShapes: 0,
    riskyShapes: 0,
    recommendations: ["Run /cache pin apply <goal>."],
  });

  assert.equal(model.badge, "cold");
  assert.equal(model.rows[0]?.tone, "muted");
  assert.equal(model.rows[2]?.tone, "muted");
});
