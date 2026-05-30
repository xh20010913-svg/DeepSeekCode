import { cacheRate } from "../../query/promptCache.js";
import type { EventRecord, RunRecord, StateStore, UsageTotals } from "../../state/sqlite.js";

export interface CacheDoctorReport {
  scope: string;
  usage: UsageTotals;
  runs: Array<{
    id: string;
    status: string;
    message: string;
    cacheHitTokens: number;
    cacheMissTokens: number;
    cacheRate: string;
  }>;
  observedRuns: number;
  prefixStableEvents: number;
  prefixDriftEvents: number;
  promptPlans: number;
  highDynamicPlans: number;
  droppedChars: number;
  guardEvents: number;
  guardRun: number;
  guardPrepare: number;
  guardBlock: number;
  guardRows: CacheDoctorGuardRow[];
  recommendations: string[];
}

export interface CacheDoctorGuardRow {
  runId: string;
  decision: string;
  profile: string;
  estimatedHitRate: number;
  stableTokens: number;
  dynamicTokens: number;
  reusableTokens: number;
  blockers: string[];
  warnings: string[];
  message: string;
}

export function buildCacheDoctorReport(state: StateStore, runId?: string): CacheDoctorReport {
  const usage = state.usageTotals(runId);
  const runs = runId
    ? [state.getRun(runId)].filter((run): run is RunRecord => Boolean(run))
    : state.listRuns(100);
  const events = runId ? state.listEvents(runId, 500) : state.listEvents(undefined, 1000);
  const runSummaries = runs
    .filter((run) => (run.cacheHitTokens ?? 0) > 0 || (run.cacheMissTokens ?? 0) > 0)
    .map((run) => ({
      id: run.id,
      status: run.status,
      message: run.message,
      cacheHitTokens: run.cacheHitTokens ?? 0,
      cacheMissTokens: run.cacheMissTokens ?? 0,
      cacheRate: cacheRate(run.cacheHitTokens ?? 0, run.cacheMissTokens ?? 0),
    }));
  const prefixEvents = events.filter((event) => event.kind === "stable_prompt_prepared");
  const promptPlanEvents = events.filter((event) => event.kind === "cache_prompt_plan");
  const prefixStableEvents = prefixEvents.filter((event) => Boolean(payloadObject(event.payload).prefix_stable)).length;
  const prefixDriftEvents = prefixEvents.length - prefixStableEvents;
  const promptPlans = promptPlanEvents.length;
  const highDynamicPlans = promptPlanEvents.filter((event) => isHighDynamicPlan(event)).length;
  const droppedChars = promptPlanEvents.reduce((sum, event) => {
    const dropped = Number(payloadObject(event.payload).dropped_chars ?? 0);
    return sum + (Number.isFinite(dropped) ? dropped : 0);
  }, 0);
  const guardRows = buildGuardRows(
    events.filter((event) => event.kind === "cache_guard"),
    runs,
  );
  const guardRun = guardRows.filter((row) => row.decision === "run").length;
  const guardPrepare = guardRows.filter((row) => row.decision === "prepare").length;
  const guardBlock = guardRows.filter((row) => row.decision === "block").length;

  return {
    scope: runId ?? "all",
    usage,
    runs: runSummaries,
    observedRuns: runSummaries.length,
    prefixStableEvents,
    prefixDriftEvents,
    promptPlans,
    highDynamicPlans,
    droppedChars,
    guardEvents: guardRows.length,
    guardRun,
    guardPrepare,
    guardBlock,
    guardRows,
    recommendations: buildRecommendations({
      usage,
      prefixDriftEvents,
      promptPlans,
      highDynamicPlans,
      droppedChars,
      guardPrepare,
      guardBlock,
      lowCacheRuns: runSummaries.filter((run) => {
        const total = run.cacheHitTokens + run.cacheMissTokens;
        return total > 0 && run.cacheHitTokens / total < 0.6;
      }).length,
    }),
  };
}

export function formatCacheDoctorReport(report: CacheDoctorReport): string {
  const lowCacheRuns = report.runs.filter((run) => {
    const total = run.cacheHitTokens + run.cacheMissTokens;
    return total > 0 && run.cacheHitTokens / total < 0.6;
  });
  return [
    "DeepSeek cache doctor",
    `scope=${report.scope}`,
    `snapshots=${report.usage.snapshots}`,
    `input=${report.usage.inputTokens} output=${report.usage.outputTokens}`,
    `cacheHit=${report.usage.cacheHitTokens} cacheMiss=${report.usage.cacheMissTokens} cacheRate=${cacheRate(report.usage.cacheHitTokens, report.usage.cacheMissTokens)}`,
    `observedRuns=${report.observedRuns}`,
    `prefixStable=${report.prefixStableEvents} prefixDrift=${report.prefixDriftEvents}`,
    `promptPlans=${report.promptPlans} highDynamic=${report.highDynamicPlans} droppedChars=${report.droppedChars}`,
    `cacheGuards=${report.guardEvents} run=${report.guardRun} prepare=${report.guardPrepare} block=${report.guardBlock}`,
    "guard review:",
    ...(report.guardRows.filter((row) => row.decision !== "run").length
      ? report.guardRows
        .filter((row) => row.decision !== "run")
        .slice(0, 8)
        .map((row) => `- ${row.runId} ${row.decision} profile=${row.profile} hit=${Math.round(row.estimatedHitRate * 100)}% ${guardIssueSummary(row)} ${row.message}`)
      : ["- none"]),
    "low-cache runs:",
    ...(lowCacheRuns.length
      ? lowCacheRuns.slice(0, 8).map((run) => `- ${run.id} ${run.cacheRate} hit=${run.cacheHitTokens} miss=${run.cacheMissTokens} ${run.status} ${run.message}`)
      : ["- none"]),
    "recommendations:",
    ...report.recommendations.map((recommendation) => `- ${recommendation}`),
  ].join("\n");
}

function buildRecommendations(input: {
  usage: UsageTotals;
  prefixDriftEvents: number;
  promptPlans: number;
  highDynamicPlans: number;
  droppedChars: number;
  guardPrepare: number;
  guardBlock: number;
  lowCacheRuns: number;
}): string[] {
  const recommendations: string[] = [];
  if (input.usage.snapshots === 0) {
    recommendations.push("Run a tool-backed request first; no persisted DeepSeek usage snapshots are available yet.");
  }
  if (input.prefixDriftEvents > 0) {
    recommendations.push("Keep system prompts and tool schemas stable between turns; prefix drift reduces DeepSeek cache reuse.");
  }
  if (input.highDynamicPlans > 0 || input.droppedChars > 0) {
    recommendations.push("Use /cache plan <goal> before large tasks and narrow selected files to reduce dynamic prompt churn.");
  }
  if (input.lowCacheRuns > 0) {
    recommendations.push("Review low-cache runs and avoid changing project memory, output style, or broad context unless needed.");
  }
  if (input.guardBlock > 0) {
    recommendations.push("Review blocked cache guard runs before retrying; strict guard can pause expensive DeepSeek calls until blockers are fixed.");
  } else if (input.guardPrepare > 0) {
    recommendations.push("Run /cache prepare or /cache profile auto for guard-prepared tasks before spending on the full request.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Cache telemetry looks healthy; keep stable runtime blocks first and append only task-specific context.");
  }
  return recommendations;
}

function buildGuardRows(events: EventRecord[], runs: RunRecord[]): CacheDoctorGuardRow[] {
  const runMessages = new Map(runs.map((run) => [run.id, run.message]));
  return events.map((event) => {
    const payload = payloadObject(event.payload);
    return {
      runId: event.runId ?? "unknown",
      decision: stringValue(payload.decision, "unknown"),
      profile: stringValue(payload.profile, "none"),
      estimatedHitRate: numberValue(payload.estimated_hit_rate),
      stableTokens: numberValue(payload.stable_tokens),
      dynamicTokens: numberValue(payload.dynamic_tokens),
      reusableTokens: numberValue(payload.reusable_tokens),
      blockers: stringArray(payload.blockers),
      warnings: stringArray(payload.warnings),
      message: runMessages.get(event.runId ?? "") ?? "",
    };
  });
}

function isHighDynamicPlan(event: EventRecord): boolean {
  const payload = payloadObject(event.payload);
  const tokens = Number(payload.approx_tokens ?? 0);
  const dropped = Number(payload.dropped_chars ?? 0);
  return tokens > 6_000 || dropped > 0;
}

function payloadObject(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function guardIssueSummary(row: CacheDoctorGuardRow): string {
  const parts = [
    row.blockers.length ? `blockers=${row.blockers.length}` : undefined,
    row.warnings.length ? `warnings=${row.warnings.length}` : undefined,
    `reusable~${row.reusableTokens}`,
  ].filter(Boolean);
  return parts.join(" ");
}
