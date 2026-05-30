import test from "node:test";
import assert from "node:assert/strict";
import { buildCacheShapePanelModel } from "./CacheShapePanel.js";

test("cache shape panel summarizes repeated prompt shapes", () => {
  const model = buildCacheShapePanelModel([{
    fingerprint: "shape-1",
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:05:00.000Z",
    count: 3,
    risk: "low",
    stableChars: 1200,
    dynamicChars: 300,
    requestChars: 80,
    dynamicShare: 0.2,
    truncatedBlocks: [],
  }, {
    fingerprint: "shape-2",
    firstSeenAt: "2026-01-01T00:02:00.000Z",
    lastSeenAt: "2026-01-01T00:06:00.000Z",
    count: 1,
    risk: "high",
    stableChars: 400,
    dynamicChars: 5000,
    requestChars: 100,
    dynamicShare: 0.88,
    truncatedBlocks: ["selected_context"],
  }]);

  assert.equal(model.badge, "review");
  assert.match(model.summary, /shapes=2 repeated=1 review=1/);
  assert.deepEqual(model.rows.map((row) => row.label), ["x3", "x1"]);
  assert.match(model.rows[1]?.detail ?? "", /truncated=selected_context/);
});

test("cache shape panel exposes an empty first-run state", () => {
  const model = buildCacheShapePanelModel([]);
  assert.equal(model.badge, "empty");
  assert.equal(model.rows[0]?.fingerprint, "no-shapes");
  assert.match(model.footer, /cache plan/);
});
