import { cacheRate } from "../../query/promptCache.js";
import type { StateStore, TaskStatus } from "../../state/sqlite.js";
import { SessionStorage } from "../session/sessionStorage.js";

export interface WorkspaceStats {
  runs: {
    totalRecent: number;
    running: number;
    succeeded: number;
    failed: number;
    paused: number;
    cancelled: number;
  };
  tasks: Record<TaskStatus, number>;
  sessions: number;
  usage: {
    snapshots: number;
    inputTokens: number;
    outputTokens: number;
    cacheHitTokens: number;
    cacheMissTokens: number;
    cacheRate: string;
  };
}

export function buildWorkspaceStats(state: StateStore, dataDir: string): WorkspaceStats {
  const runs = state.listRuns(100);
  const runCounts = {
    totalRecent: runs.length,
    running: 0,
    succeeded: 0,
    failed: 0,
    paused: 0,
    cancelled: 0,
  };
  const taskCounts: Record<TaskStatus, number> = {
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    paused: 0,
    cancelled: 0,
  };
  for (const run of runs) {
    runCounts[run.status] += 1;
    for (const task of state.listTasks(run.id)) taskCounts[task.status] += 1;
  }
  const usage = state.usageTotals();
  return {
    runs: runCounts,
    tasks: taskCounts,
    sessions: SessionStorage.list(dataDir, 1000).length,
    usage: {
      snapshots: usage.snapshots,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheHitTokens: usage.cacheHitTokens,
      cacheMissTokens: usage.cacheMissTokens,
      cacheRate: cacheRate(usage.cacheHitTokens, usage.cacheMissTokens),
    },
  };
}

export function formatWorkspaceStats(stats: WorkspaceStats): string {
  return [
    "DeepSeekCode stats",
    `runs: total=${stats.runs.totalRecent} running=${stats.runs.running} paused=${stats.runs.paused} succeeded=${stats.runs.succeeded} failed=${stats.runs.failed} cancelled=${stats.runs.cancelled}`,
    `tasks: queued=${stats.tasks.queued} running=${stats.tasks.running} paused=${stats.tasks.paused} succeeded=${stats.tasks.succeeded} failed=${stats.tasks.failed} cancelled=${stats.tasks.cancelled}`,
    `sessions: ${stats.sessions}`,
    `usage: snapshots=${stats.usage.snapshots} input=${stats.usage.inputTokens} output=${stats.usage.outputTokens} cacheHit=${stats.usage.cacheHitTokens} cacheMiss=${stats.usage.cacheMissTokens} cacheRate=${stats.usage.cacheRate}`,
  ].join("\n");
}
