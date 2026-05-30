import test from "node:test";
import assert from "node:assert/strict";
import { buildTool } from "../Tool.js";
import { z } from "zod";
import { PrefixStabilityManager, cacheRate } from "./promptCache.js";

const tool = buildTool({
  name: "read_file",
  description: "read",
  inputSchema: z.object({ path: z.string() }),
  readOnly: true,
  concurrencySafe: true,
  run() {
    return { result: { action_type: "read_file", status: "succeeded" } };
  },
});

test("PrefixStabilityManager reports stable repeated prefix", () => {
  const manager = new PrefixStabilityManager();
  assert.equal(manager.check("system", [tool]).stable, true);
  assert.equal(manager.check("system", [tool]).stable, true);
  assert.equal(manager.snapshot().changes, 0);
});

test("PrefixStabilityManager detects system drift", () => {
  const manager = new PrefixStabilityManager();
  manager.check("system", [tool]);
  const result = manager.check("system changed", [tool]);
  assert.equal(result.stable, false);
  if (!result.stable) assert.equal(result.drift.systemChanged, true);
});

test("cacheRate handles full, empty and partial telemetry", () => {
  assert.equal(cacheRate(70, 30), "70%");
  assert.equal(cacheRate(0, 0), "n/a");
});
