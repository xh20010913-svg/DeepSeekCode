import test from "node:test";
import assert from "node:assert/strict";
import { estimateUsageCost, formatCostEstimate, priceConfigFromEnv } from "./costEstimate.js";

test("cost estimator uses cache-specific rates when configured", () => {
  const price = priceConfigFromEnv({
    DEEPSEEKCODE_PRICE_INPUT_PER_M: "1",
    DEEPSEEKCODE_PRICE_OUTPUT_PER_M: "2",
    DEEPSEEKCODE_PRICE_CACHE_HIT_PER_M: "0.1",
    DEEPSEEKCODE_PRICE_CACHE_MISS_PER_M: "1",
    DEEPSEEKCODE_PRICE_CURRENCY: "USD",
  });
  const estimate = estimateUsageCost({
    inputTokens: 1000,
    outputTokens: 500,
    cacheHitTokens: 800,
    cacheMissTokens: 200,
    snapshots: 2,
  }, price);
  assert.equal(estimate.configured, true);
  assertClose(estimate.inputCost, 0.00028);
  assertClose(estimate.outputCost, 0.001);
  assertClose(estimate.totalCost, 0.00128);
  assertClose(estimate.estimatedCacheSavings, 0.00072);
  assert.match(formatCostEstimate("all", estimate), /estimated=USD 0\.001280/);
});

test("cost estimator is explicit when pricing is unconfigured", () => {
  const estimate = estimateUsageCost({
    inputTokens: 1000,
    outputTokens: 500,
    cacheHitTokens: 0,
    cacheMissTokens: 0,
    snapshots: 1,
  }, priceConfigFromEnv({}));
  assert.equal(estimate.configured, false);
  assert.match(formatCostEstimate("all", estimate), /estimated=unconfigured/);
});

function assertClose(actual: number | undefined, expected: number): void {
  assert.equal(typeof actual, "number");
  assert.ok(Math.abs((actual ?? 0) - expected) < 1e-12);
}
