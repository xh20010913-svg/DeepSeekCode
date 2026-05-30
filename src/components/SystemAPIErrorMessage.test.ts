import test from "node:test";
import assert from "node:assert/strict";
import { formatAPIError, systemAPIErrorMessageModel } from "./SystemAPIErrorMessage.js";

test("system API error formats Error and object values", () => {
  assert.equal(formatAPIError(new Error("bad gateway")), "bad gateway");
  assert.equal(formatAPIError({ code: 500 }), "{\"code\":500}");
});

test("system API error truncates large provider payloads", () => {
  const model = systemAPIErrorMessageModel({
    error: "x".repeat(1200),
    verbose: false,
  });

  assert.equal(model.truncated, true);
  assert.equal(model.body.length, 1003);
});

test("system API error includes retry timing when available", () => {
  const model = systemAPIErrorMessageModel({
    error: "temporary",
    retryAttempt: 2,
    retryInMs: 3000,
    maxRetries: 5,
  });

  assert.equal(model.retry, "retrying in 3 seconds (attempt 2/5)");
});
