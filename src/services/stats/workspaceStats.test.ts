import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { StateStore } from "../../state/sqlite.js";
import { buildWorkspaceStats, formatWorkspaceStats } from "./workspaceStats.js";

test("workspace stats summarize runs, tasks, sessions, and usage", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-stats-"));
  const state = new StateStore(path.join(dataDir, "state.sqlite"));
  const runId = state.createRun({ projectPath: dataDir, model: "deepseek-v4-flash", message: "stats" });
  state.createTask({ runId, agent: "Tester", title: "Stats", status: "queued" });
  state.recordUsage(runId, { inputTokens: 10, outputTokens: 1, cacheHitTokens: 8, cacheMissTokens: 2 }, "test");
  const stats = buildWorkspaceStats(state, dataDir);
  assert.equal(stats.runs.running, 1);
  assert.equal(stats.tasks.queued, 1);
  assert.equal(stats.usage.inputTokens, 10);
  assert.match(formatWorkspaceStats(stats), /DeepSeekCode stats/);
  state.close();
});
