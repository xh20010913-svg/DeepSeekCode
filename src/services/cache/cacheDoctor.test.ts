import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { StateStore } from "../../state/sqlite.js";
import { buildCacheDoctorReport, formatCacheDoctorReport } from "./cacheDoctor.js";

test("cache doctor reports low cache runs, prefix drift, and prompt churn", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-cache-doctor-"));
  const state = new StateStore(path.join(dataDir, "state.sqlite"));
  const runId = state.createRun({
    projectPath: dataDir,
    model: "deepseek-v4-flash",
    message: "cache doctor",
  });
  state.recordUsage(runId, {
    inputTokens: 100,
    outputTokens: 20,
    cacheHitTokens: 25,
    cacheMissTokens: 75,
  }, "test");
  state.appendEvent(runId, "stable_prompt_prepared", {
    prefix_stable: false,
    drift_label: "tools_changed",
  });
  state.appendEvent(runId, "cache_prompt_plan", {
    approx_tokens: 7000,
    dropped_chars: 1200,
  });
  state.appendEvent(runId, "cache_guard", {
    decision: "prepare",
    profile: "frontend",
    estimated_hit_rate: 0.22,
    stable_tokens: 800,
    dynamic_tokens: 1300,
    reusable_tokens: 240,
    blockers: [],
    warnings: ["estimated cache hit below 35%"],
  });

  const report = buildCacheDoctorReport(state, runId);
  assert.equal(report.scope, runId);
  assert.equal(report.prefixDriftEvents, 1);
  assert.equal(report.highDynamicPlans, 1);
  assert.equal(report.droppedChars, 1200);
  assert.equal(report.guardEvents, 1);
  assert.equal(report.guardPrepare, 1);
  assert.equal(report.guardRows[0]?.profile, "frontend");
  assert.equal(report.runs[0]?.cacheRate, "25%");
  const formatted = formatCacheDoctorReport(report);
  assert.match(formatted, /DeepSeek cache doctor/);
  assert.match(formatted, /cacheGuards=1 run=0 prepare=1 block=0/);
  assert.match(formatted, /guard review:/);
  assert.match(formatted, /low-cache runs:/);
  assert.match(formatted, /prefix drift reduces DeepSeek cache reuse/);
  assert.match(formatted, /guard-prepared tasks/);
  state.close();
});

test("cache doctor reports healthy empty telemetry without failing", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-cache-doctor-"));
  const state = new StateStore(path.join(dataDir, "state.sqlite"));
  const report = buildCacheDoctorReport(state);
  assert.equal(report.usage.snapshots, 0);
  assert.equal(report.guardEvents, 0);
  assert.match(formatCacheDoctorReport(report), /no persisted DeepSeek usage/);
  state.close();
});
