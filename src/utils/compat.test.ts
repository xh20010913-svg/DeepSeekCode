import test from "node:test";
import assert from "node:assert/strict";
import {
  asArray,
  createUtilityAdapter,
  normalizeUtilityReference,
  safeJsonParse,
  stableStringify,
  truncateText,
  utilityCompatibilityInfo,
  utilityFamily,
} from "./compat.js";

test("utility adapter normalizes reference paths and detects families", () => {
  assert.equal(normalizeUtilityReference("mcp\\client.ts"), "mcp/client.ts");
  assert.equal(utilityFamily("gitDiff.ts"), "git");
  assert.equal(utilityFamily("permissions/check.ts"), "permission");
});

test("utility adapter maps high-value families to local DeepSeekCode targets", () => {
  const info = utilityCompatibilityInfo("tokenEstimation.ts");
  assert.equal(info.family, "token");
  assert.match(info.localTarget, /cache/);
});

test("utility adapter exposes small safe helpers", () => {
  assert.deepEqual(asArray("x"), ["x"]);
  assert.equal(truncateText("abcdef", 4), "a...");
  assert.deepEqual(safeJsonParse("{\"b\":1}"), { b: 1 });
  assert.equal(stableStringify({ b: 1, a: 2 }), "{\"a\":2,\"b\":1}");
  assert.match(createUtilityAdapter("auth.ts").unavailable("auth").message, /compatibility path/);
});
