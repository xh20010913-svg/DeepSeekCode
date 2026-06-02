import fs from "node:fs";
import path from "node:path";
import type { StateStore, UsageTotals } from "../../state/sqlite.js";

export interface ScenarioReportResult {
  runId: string;
  jsonPath: string;
  markdownPath: string;
}

interface TracePayload {
  run?: Record<string, unknown>;
  tasks?: Record<string, unknown>[];
  jobs?: Record<string, unknown>[];
  actions?: Record<string, unknown>[];
  artifacts?: Record<string, unknown>[];
  checkpoints?: Record<string, unknown>[];
  events?: Record<string, unknown>[];
}

export function writeScenarioReport(input: {
  state: StateStore;
  runId: string;
  outputDir: string;
}): ScenarioReportResult {
  const trace = input.state.traceRun(input.runId) as TracePayload;
  if (!trace.run) throw new Error(`run not found: ${input.runId}`);
  const usage = input.state.usageTotals(input.runId);
  const report = buildScenarioReport(input.runId, trace, usage);
  fs.mkdirSync(input.outputDir, { recursive: true });
  const safeRunId = input.runId.replace(/[^a-zA-Z0-9_-]+/g, "_");
  const jsonPath = path.join(input.outputDir, `scenario-report-${safeRunId}.json`);
  const markdownPath = path.join(input.outputDir, `scenario-report-${safeRunId}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(markdownPath, renderMarkdownReport(report), "utf8");
  return { runId: input.runId, jsonPath, markdownPath };
}

function buildScenarioReport(runId: string, trace: TracePayload, usage: UsageTotals): Record<string, unknown> {
  const events = trace.events ?? [];
  const actions = trace.actions ?? [];
  const artifacts = trace.artifacts ?? [];
  const failures = [
    ...actions.filter((action) => action.status === "failed").map((action) => ({
      type: "tool",
      action: action.action_type,
      path: action.path,
      message: action.message,
    })),
    ...events.filter((event) => /failed|error|blocked/i.test(String(event.kind))).map((event) => ({
      type: "event",
      kind: event.kind,
      payload: compactPayload(event.payload_json ?? event.payload),
    })),
  ];
  const promptEvents = events
    .filter((event) => event.kind === "provider_request_diagnostics")
    .map((event) => event.payload_json ?? event.payload)
    .slice(0, 20);
  const toolCounts = actions.reduce<Record<string, number>>((counts, action) => {
    const type = String(action.action_type ?? "tool");
    counts[type] = (counts[type] ?? 0) + 1;
    return counts;
  }, {});
  const performance = performanceSummary(events);
  const cacheTotal = usage.cacheHitTokens + usage.cacheMissTokens;
  const cacheHitRate = cacheTotal > 0 ? usage.cacheHitTokens / cacheTotal : null;
  return {
    version: 1,
    runId,
    generatedAt: new Date().toISOString(),
    run: trace.run,
    usage: {
      ...usage,
      cacheHitRate,
    },
    toolCounts,
    performance,
    actionCount: actions.length,
    artifactCount: artifacts.length,
    artifacts,
    jobs: trace.jobs ?? [],
    checkpoints: trace.checkpoints ?? [],
    promptAuditSummary: promptEvents,
    tasks: trace.tasks ?? [],
    failures,
    recommendations: recommendationsFor(failures, usage, toolCounts),
  };
}

function renderMarkdownReport(report: Record<string, unknown>): string {
  const run = asRecord(report.run);
  const usage = asRecord(report.usage);
  const artifacts = Array.isArray(report.artifacts) ? report.artifacts as Record<string, unknown>[] : [];
  const jobs = Array.isArray(report.jobs) ? report.jobs as Record<string, unknown>[] : [];
  const checkpoints = Array.isArray(report.checkpoints) ? report.checkpoints as Record<string, unknown>[] : [];
  const failures = Array.isArray(report.failures) ? report.failures as Record<string, unknown>[] : [];
  const promptAudit = Array.isArray(report.promptAuditSummary) ? report.promptAuditSummary as Record<string, unknown>[] : [];
  const recommendations = Array.isArray(report.recommendations) ? report.recommendations as string[] : [];
  const performance = asRecord(report.performance);
  const providerTimings = Array.isArray(performance.providerCalls) ? performance.providerCalls as Record<string, unknown>[] : [];
  const toolTimings = Array.isArray(performance.toolDurations) ? performance.toolDurations as Record<string, unknown>[] : [];
  return [
    `# Scenario Report: ${report.runId}`,
    "",
    "## Run",
    `- model: ${stringValue(run.model)}`,
    `- status: ${stringValue(run.status)}`,
    `- message: ${stringValue(run.message)}`,
    `- created: ${formatMs(run.createdAtMs)}`,
    `- updated: ${formatMs(run.updatedAtMs)}`,
    "",
    "## Usage",
    `- input tokens: ${numberValue(usage.inputTokens)}`,
    `- output tokens: ${numberValue(usage.outputTokens)}`,
    `- cache hit tokens: ${numberValue(usage.cacheHitTokens)}`,
    `- cache miss tokens: ${numberValue(usage.cacheMissTokens)}`,
    `- cache hit rate: ${formatRate(usage.cacheHitRate)}`,
    `- snapshots: ${numberValue(usage.snapshots)}`,
    "",
    "## Tools",
    ...Object.entries(asRecord(report.toolCounts)).map(([name, count]) => `- ${name}: ${count}`),
    "",
    "## Performance",
    `- provider total: ${numberValue(performance.providerTotalMs)} ms`,
    `- tool total: ${numberValue(performance.toolTotalMs)} ms`,
    `- slowest provider call: ${stringValue(performance.slowestProviderCall)}`,
    `- slowest tool call: ${stringValue(performance.slowestToolCall)}`,
    ...(providerTimings.length
      ? providerTimings.map((item) => `- provider ${stringValue(item.kind)} ${stringValue(item.status)} count=${numberValue(item.count)} total=${numberValue(item.totalMs)}ms max=${numberValue(item.maxMs)}ms`)
      : ["- provider timings: none"]),
    ...(toolTimings.length
      ? toolTimings.map((item) => `- tool ${stringValue(item.tool)} count=${numberValue(item.count)} total=${numberValue(item.totalMs)}ms max=${numberValue(item.maxMs)}ms`)
      : ["- tool timings: none"]),
    "",
    "## Artifacts",
    ...(artifacts.length
      ? artifacts.map((artifact) => `- ${stringValue(artifact.kind)}: ${stringValue(artifact.path)}`)
      : ["- none"]),
    "",
    "## Jobs",
    ...(jobs.length
      ? jobs.map((job) => `- ${stringValue(job.kind)} ${stringValue(job.status)} attempts=${numberValue(job.attempts)}/${numberValue(job.maxAttempts)} ${stringValue(job.detail)}`)
      : ["- none"]),
    "",
    "## Checkpoints",
    ...(checkpoints.length
      ? checkpoints.map((checkpoint) => `- ${stringValue(checkpoint.scope)} ${formatMs(checkpoint.createdAtMs)}`)
      : ["- none"]),
    "",
    "## Prompt Audit Summary",
    ...(promptAudit.length
      ? promptAudit.map((item, index) => `- ${index + 1}. ${stringValue(item.kind)} ${numberValue(item.approxPromptTokens)} tokens prefix=${stringValue(item.stablePrefixHash)}`)
      : ["- no provider_request_diagnostics events recorded"]),
    "",
    "## Failures",
    ...(failures.length
      ? failures.map((failure) => `- ${stringValue(failure.type)} ${stringValue(failure.action ?? failure.kind)} ${stringValue(failure.message ?? failure.payload)}`)
      : ["- none"]),
    "",
    "## Recommendations",
    ...(recommendations.length ? recommendations.map((item) => `- ${item}`) : ["- no immediate recommendations"]),
    "",
  ].join("\n");
}

function performanceSummary(events: Record<string, unknown>[]): Record<string, unknown> {
  const providerCalls = aggregateByKey(
    events
      .filter((event) => event.kind === "provider_call_timing")
      .map((event) => asRecord(event.payload_json ?? event.payload)),
    (payload) => `${stringValue(payload.kind)}:${stringValue(payload.status)}`,
    (payload) => ({
      kind: stringValue(payload.kind),
      status: stringValue(payload.status),
      durationMs: numeric(payload.duration_ms),
    }),
  ).map(({ key: _key, ...rest }) => rest);
  const toolDurations = aggregateByKey(
    events
      .filter((event) => event.kind === "tool_finish")
      .map((event) => asRecord(event.payload_json ?? event.payload)),
    (payload) => stringValue(asRecord(payload.action).type),
    (payload) => ({
      tool: stringValue(asRecord(payload.action).type),
      status: stringValue(asRecord(payload.result).status),
      durationMs: numeric(payload.duration_ms),
    }),
  ).map(({ key: _key, ...rest }) => rest);
  const providerTotalMs = providerCalls.reduce((sum, item) => sum + numeric(item.totalMs), 0);
  const toolTotalMs = toolDurations.reduce((sum, item) => sum + numeric(item.totalMs), 0);
  return {
    providerTotalMs,
    toolTotalMs,
    providerCalls,
    toolDurations,
    slowestProviderCall: slowestLabel(providerCalls, "kind"),
    slowestToolCall: slowestLabel(toolDurations, "tool"),
  };
}

function aggregateByKey<T extends Record<string, unknown>>(
  values: Record<string, unknown>[],
  keyOf: (value: Record<string, unknown>) => string,
  project: (value: Record<string, unknown>) => T & { durationMs: number },
): Array<Record<string, unknown>> {
  const groups = new Map<string, Record<string, unknown>>();
  for (const value of values) {
    const key = keyOf(value);
    const projected = project(value);
    const current = groups.get(key);
    if (!current) {
      groups.set(key, {
        key,
        ...projected,
        count: 1,
        totalMs: projected.durationMs,
        maxMs: projected.durationMs,
      });
      continue;
    }
    current.count = numeric(current.count) + 1;
    current.totalMs = numeric(current.totalMs) + projected.durationMs;
    current.maxMs = Math.max(numeric(current.maxMs), projected.durationMs);
  }
  return [...groups.values()];
}

function slowestLabel(items: Array<Record<string, unknown>>, labelKey: string): string {
  const slowest = items.reduce<Record<string, unknown> | undefined>((best, item) => {
    if (!best) return item;
    return numeric(item.maxMs) > numeric(best.maxMs) ? item : best;
  }, undefined);
  return slowest ? `${stringValue(slowest[labelKey])} ${numberValue(slowest.maxMs)}ms` : "-";
}

function recommendationsFor(
  failures: Array<Record<string, unknown>>,
  usage: UsageTotals,
  toolCounts: Record<string, number>,
): string[] {
  const recommendations: string[] = [];
  if (failures.length > 0) recommendations.push("Inspect failed tool/event rows and rerun with prompt audit enabled.");
  const cacheTotal = usage.cacheHitTokens + usage.cacheMissTokens;
  if (cacheTotal > 0 && usage.cacheHitTokens / cacheTotal < 0.5) {
    recommendations.push("Cache hit rate is low; keep stable prompt blocks before dynamic run state and compress old tool results.");
  }
  if ((toolCounts.read_file ?? 0) > 10 && (toolCounts.write_file ?? 0) === 0) {
    recommendations.push("The run inspected many files without writing; tighten planning or ask the model to make concrete changes after inspection.");
  }
  if ((toolCounts.run_command ?? 0) === 0 && Object.keys(toolCounts).some((tool) => /html|browser|validate/.test(tool))) {
    recommendations.push("Add browser or command validation for runnable artifacts when permissions allow it.");
  }
  return recommendations;
}

function compactPayload(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? {});
  return text.replace(/\s+/g, " ").slice(0, 500);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function numberValue(value: unknown): number | string {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatRate(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${Math.round(value * 1000) / 10}%`;
}

function formatMs(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Date(value).toISOString();
}
