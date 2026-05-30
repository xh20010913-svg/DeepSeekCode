import test from "node:test";
import assert from "node:assert/strict";
import { buildCachePanelModel, parsePercentRatio } from "./CachePanel.js";

test("cache panel model favors token telemetry over formatted rate", () => {
  const model = buildCachePanelModel({
    hitTokens: 75,
    missTokens: 25,
    observedRuns: 3,
    rate: "75%",
  });

  assert.equal(model.ratio, 0.75);
  assert.equal(model.status, "success");
  assert.equal(model.headline, "cache hit 75%");
  assert.equal(model.detail, "hit 75 / miss 25 / runs 3");
});

test("cache panel model handles empty telemetry without pretending success", () => {
  const model = buildCachePanelModel({
    hitTokens: 0,
    missTokens: 0,
    observedRuns: 0,
    rate: "n/a",
  });

  assert.equal(model.ratio, 0);
  assert.equal(model.status, "pending");
  assert.equal(model.headline, "waiting for provider telemetry");
});

test("cache panel parses percent fallback safely", () => {
  assert.equal(parsePercentRatio("62.5%"), 0.625);
  assert.equal(parsePercentRatio("n/a"), 0);
  assert.equal(parsePercentRatio("500%"), 1);
});
