import test from "node:test";
import assert from "node:assert/strict";
import {
  CRITICAL_MEMORY_THRESHOLD,
  HIGH_MEMORY_THRESHOLD,
  memoryUsageSnapshot,
  memoryUsageStatus,
} from "./useMemoryUsage.js";

test("memory usage status follows high and critical thresholds", () => {
  assert.equal(memoryUsageStatus(HIGH_MEMORY_THRESHOLD - 1), "normal");
  assert.equal(memoryUsageStatus(HIGH_MEMORY_THRESHOLD), "high");
  assert.equal(memoryUsageStatus(CRITICAL_MEMORY_THRESHOLD), "critical");
});

test("memory usage snapshot stays quiet while memory is normal", () => {
  assert.equal(memoryUsageSnapshot(HIGH_MEMORY_THRESHOLD - 1), null);
  assert.deepEqual(memoryUsageSnapshot(HIGH_MEMORY_THRESHOLD), {
    heapUsed: HIGH_MEMORY_THRESHOLD,
    status: "high",
  });
});
