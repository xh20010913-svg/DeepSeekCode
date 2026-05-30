import test from "node:test";
import assert from "node:assert/strict";
import { isRateLimitText, rateLimitMessageModel } from "./RateLimitMessage.js";

test("rate limit message detects common provider limit text", () => {
  assert.equal(isRateLimitText("HTTP 429 Too Many Requests"), true);
  assert.equal(isRateLimitText("quota exceeded"), true);
  assert.equal(isRateLimitText("ordinary failure"), false);
});

test("rate limit message recommends cheap model and cache planning", () => {
  const model = rateLimitMessageModel("rate limit");

  assert.match(model.recommendation, /deepseek-v4-flash/);
  assert.match(model.recommendation, /\/cache plan/);
});
