import type { RuntimeConfig } from "../../bootstrap/config.js";
import type { ChatMessage, DeepSeekProviderClient, UsageSnapshot } from "../../protocol/provider.js";
import type { EventRecord, StateStore, TaskRecord } from "../../state/sqlite.js";
import { cacheRate } from "../../query/promptCache.js";

export interface AsyncQuestionResult {
  answer: string;
  usage?: UsageSnapshot;
}

export async function answerAsyncQuestion(input: {
  question: string;
  config: RuntimeConfig;
  state: StateStore;
  provider: DeepSeekProviderClient;
  runId?: string;
  signal?: AbortSignal;
}): Promise<AsyncQuestionResult> {
  const run = input.runId ? input.state.getRun(input.runId) : input.state.listRuns(1)[0];
  const events = run ? input.state.listEvents(run.id, 12) : input.state.listEvents(undefined, 12);
  const tasks = run ? input.state.listTasks(run.id) : [];
  const usage = run ? input.state.usageTotals(run.id) : input.state.usageTotals();
  const trace = run ? input.state.traceRun(run.id) as { artifacts?: Array<{ kind?: string; path?: string }> } : undefined;
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "You are DeepSeekCode's read-only side-channel assistant.",
        "Answer the user's question using only the provided run/project state.",
        "Do not plan or perform file edits, shell commands, browser actions, MCP calls, or any local tool work.",
        "If the question asks you to continue implementation, modify files, or execute work, say that it must be queued or sent as a normal task.",
        "Keep the answer concise and practical.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Project: ${input.config.projectPath}`,
        run
          ? `Run: ${run.id} status=${run.status} model=${run.model} actions=${run.actionCount} artifacts=${run.artifactCount}`
          : "Run: none",
        `Usage: input=${usage.inputTokens} output=${usage.outputTokens} cache=${cacheRate(usage.cacheHitTokens, usage.cacheMissTokens)}`,
        "",
        "Tasks:",
        formatTasks(tasks),
        "",
        "Recent events:",
        formatEvents(events),
        "",
        "Artifacts:",
        formatArtifacts(trace?.artifacts ?? []),
        "",
        `Question: ${input.question}`,
      ].join("\n"),
    },
  ];
  const reply = await input.provider.completeChat(messages, { signal: input.signal });
  return {
    answer: reply.text.trim() || "(no answer)",
    usage: {
      inputTokens: reply.inputTokens,
      outputTokens: reply.outputTokens,
      cacheHitTokens: reply.cacheHitTokens,
      cacheMissTokens: reply.cacheMissTokens,
    },
  };
}

function formatTasks(tasks: TaskRecord[]): string {
  if (!tasks.length) return "- none";
  return tasks.slice(-12).map((task) =>
    `- ${task.status} ${task.agent}: ${task.title}${task.detail ? ` (${task.detail})` : ""}`,
  ).join("\n");
}

function formatEvents(events: EventRecord[]): string {
  if (!events.length) return "- none";
  return events.map((event) => `- ${event.kind}: ${summarizePayload(event.payload)}`).join("\n");
}

function formatArtifacts(artifacts: Array<{ kind?: string; path?: string }>): string {
  if (!artifacts.length) return "- none";
  return artifacts.slice(-10).map((artifact) => `- ${artifact.path ?? "(unknown)"}${artifact.kind ? ` (${artifact.kind})` : ""}`).join("\n");
}

function summarizePayload(payload: unknown): string {
  try {
    return JSON.stringify(payload).replace(/\s+/g, " ").slice(0, 220);
  } catch {
    return String(payload).slice(0, 220);
  }
}
