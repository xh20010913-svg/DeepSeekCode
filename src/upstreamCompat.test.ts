import test from "node:test";
import assert from "node:assert/strict";
import {
  createSourceAdapter,
  normalizeSourceReference,
  sourceCompatibilityInfo,
  sourceModuleName,
} from "./upstreamCompat.js";

test("source adapter normalizes paths and detects modules", () => {
  assert.equal(normalizeSourceReference("bridge\\bridgeApi.ts"), "bridge/bridgeApi.ts");
  assert.equal(sourceModuleName("tasks/LocalShellTask/guards.ts"), "tasks");
});

test("source adapter maps reference modules to local targets", () => {
  const info = sourceCompatibilityInfo("query/tokenBudget.ts");
  assert.equal(info.moduleName, "query");
  assert.equal(info.availability, "implemented");
  assert.match(info.localTarget, /query/);
});

test("source adapter returns explicit local-safe unavailable messages", () => {
  const result = createSourceAdapter("upstreamproxy/relay.ts").unavailable("relay");
  assert.equal(result.status, "unavailable");
  assert.match(result.message, /compatibility path/);
});
