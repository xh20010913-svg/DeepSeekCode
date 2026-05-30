import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CacheShapeHistoryService,
  formatCacheShapeHistory,
  formatCacheShapeObservation,
} from "./cacheShapeHistory.js";
import type { CacheStabilityReport } from "./cacheStability.js";

function report(fingerprint: string, risk: CacheStabilityReport["risk"] = "low"): CacheStabilityReport {
  return {
    risk,
    shapeFingerprint: fingerprint,
    stableChars: 1000,
    dynamicChars: risk === "high" ? 5000 : 200,
    requestChars: 80,
    dynamicShare: risk === "high" ? 0.82 : 0.16,
    truncatedBlocks: risk === "high" ? ["selected_context"] : [],
    stableTitles: ["project_memory"],
    recommendation: "keep stable prefix",
  };
}

test("cache shape history records repeat prompt shapes without prompt bodies", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-cache-shape-"));
  const service = new CacheShapeHistoryService(projectPath);
  const first = service.record(report("abc123"), new Date("2026-01-01T00:00:00.000Z"));
  const second = service.record(report("abc123"), new Date("2026-01-01T00:10:00.000Z"));

  assert.equal(first.repeated, false);
  assert.equal(second.repeated, true);
  assert.equal(second.record.count, 2);
  assert.match(formatCacheShapeObservation(second), /shapeSeen=repeat=2/);
  const saved = fs.readFileSync(service.path(), "utf8");
  assert.doesNotMatch(saved, /keep stable prefix/);
});

test("cache shape history lists recent shapes and can clear them", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-cache-shape-"));
  const service = new CacheShapeHistoryService(projectPath);
  service.record(report("old111"), new Date("2026-01-01T00:00:00.000Z"));
  service.record(report("new222", "high"), new Date("2026-01-01T00:05:00.000Z"));

  const records = service.list();
  assert.equal(records[0]?.fingerprint, "new222");
  assert.match(formatCacheShapeHistory(records), /truncated=selected_context/);
  assert.equal(service.clear(), 2);
  assert.equal(service.list().length, 0);
});
