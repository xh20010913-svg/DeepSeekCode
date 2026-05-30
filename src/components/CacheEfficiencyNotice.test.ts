import test from "node:test";
import assert from "node:assert/strict";
import { buildCacheEfficiencyNotice } from "./CacheEfficiencyNotice.js";

test("cache efficiency notice prompts planning before telemetry exists", () => {
  const model = buildCacheEfficiencyNotice({
    hitTokens: 0,
    missTokens: 0,
    observedRuns: 0,
    rate: "n/a",
  });

  assert.equal(model.state, "pending");
  assert.equal(model.title, "cache telemetry pending");
  assert.match(model.recommendation, /cache plan/);
});

test("cache efficiency notice recognizes strong prefix reuse", () => {
  const model = buildCacheEfficiencyNotice({
    hitTokens: 700,
    missTokens: 300,
    observedRuns: 4,
    rate: "70%",
  });

  assert.equal(model.state, "success");
  assert.equal(model.title, "strong prefix reuse");
  assert.match(model.detail, /70%/);
});

test("cache efficiency notice warns on low reuse", () => {
  const model = buildCacheEfficiencyNotice({
    hitTokens: 100,
    missTokens: 900,
    observedRuns: 2,
    rate: "10%",
  });

  assert.equal(model.state, "error");
  assert.equal(model.title, "low cache reuse");
  assert.match(model.recommendation, /cache doctor/);
});
