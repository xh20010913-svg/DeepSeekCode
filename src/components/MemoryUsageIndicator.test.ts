import test from "node:test";
import assert from "node:assert/strict";
import { memoryUsageIndicatorModel, formatMemoryBytes } from "./MemoryUsageIndicator.js";

test("memory usage indicator stays hidden for normal memory", () => {
  assert.equal(memoryUsageIndicatorModel(null), null);
  assert.equal(memoryUsageIndicatorModel({ heapUsed: 1024, status: "normal" }), null);
});

test("memory usage indicator recommends compacting before expensive work", () => {
  const model = memoryUsageIndicatorModel({
    heapUsed: 1.75 * 1024 * 1024 * 1024,
    status: "high",
  });

  assert.equal(model?.tone, "warning");
  assert.match(model?.text ?? "", /\/compact/);
  assert.match(model?.text ?? "", /\/cache plan/);
});

test("memory usage indicator escalates critical heap usage", () => {
  const model = memoryUsageIndicatorModel({
    heapUsed: 2.75 * 1024 * 1024 * 1024,
    status: "critical",
  });

  assert.equal(model?.tone, "error");
  assert.match(model?.text ?? "", /restart/);
});

test("memory byte formatting uses compact binary units", () => {
  assert.equal(formatMemoryBytes(512), "512 B");
  assert.equal(formatMemoryBytes(1536), "1.5 KB");
  assert.equal(formatMemoryBytes(2 * 1024 * 1024 * 1024), "2.0 GB");
});
