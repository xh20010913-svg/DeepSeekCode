import { cacheRate } from "../query/promptCache.js";
import type { QueryEvent } from "../query/QueryEngine.js";
import { estimateUsageCost, priceConfigFromEnv } from "../services/cost/costEstimate.js";
import type { StateStore, UsageTotals } from "../state/sqlite.js";
import { compactOneLine, redactRemoteText } from "./redact.js";

export type RemoteTodoStatus = "pending" | "in_progress" | "completed";

export interface RemoteTodoItem {
  title: string;
  status: RemoteTodoStatus;
}

export interface RemoteRenderState {
  phase?: string;
  lastTool?: string;
  tools: string[];
  artifacts: string[];
  errors: string[];
  assistant: string;
  todos: RemoteTodoItem[];
  usage?: UsageTotals;
}

export interface RemoteFinalRender {
  text: string;
  markdown: string;
  artifacts: string[];
}

interface TraceArtifact {
  path?: string;
  kind?: string;
}

export class RemoteReplyRenderer {
  private readonly state: RemoteRenderState = {
    tools: [],
    artifacts: [],
    errors: [],
    assistant: "",
    todos: [],
  };
  private lastProgressFingerprint = "";

  constructor(private readonly model: string) {}

  accept(event: QueryEvent): string | undefined {
    if (event.type === "status") {
      this.state.phase = event.detail ? `${event.text}: ${event.detail}` : event.text;
      return this.isTaskLike()
        ? this.progress({ important: isImportantPhase(event.phase) })
        : undefined;
    }
    if (event.type === "usage") {
      this.state.usage = {
        inputTokens: event.usage.inputTokens ?? 0,
        outputTokens: event.usage.outputTokens ?? 0,
        cacheHitTokens: event.usage.cacheHitTokens ?? 0,
        cacheMissTokens: event.usage.cacheMissTokens ?? 0,
        snapshots: 1,
      };
      return undefined;
    }
    if (event.type === "tool_start") {
      this.state.lastTool = compactOneLine(event.text, 120);
      this.state.tools.push(this.state.lastTool);
      return this.progress({ important: false });
    }
    if (event.type === "tool_result") {
      const line = compactOneLine(firstLine(event.text), 180);
      this.state.lastTool = line;
      this.state.tools.push(line);
      this.mergeTodos(parseTodos(event.text));
      const artifact = extractArtifactPath(event.text);
      if (artifact) this.state.artifacts.push(artifact);
      return this.progress({ important: Boolean(artifact) || event.text.includes("TodoWrite") });
    }
    if (event.type === "assistant_delta") {
      this.state.assistant += event.text;
      return undefined;
    }
    if (event.type === "assistant") {
      this.state.assistant = event.text;
      return undefined;
    }
    if (event.type === "error") {
      const line = compactOneLine(event.text, 240);
      this.state.errors.push(line);
      return this.progress({ important: true });
    }
    if (event.type === "command") {
      this.state.phase = compactOneLine(event.text, 180);
      return this.progress({ important: true });
    }
    return undefined;
  }

  progress(input: { important?: boolean } = {}): string | undefined {
    if (!input.important && !this.state.todos.length && !this.state.errors.length) return undefined;
    const text = this.renderProgressCard();
    const fingerprint = compactOneLine(text, 800);
    if (fingerprint === this.lastProgressFingerprint) return undefined;
    this.lastProgressFingerprint = fingerprint;
    return text;
  }

  final(input: { stateStore: StateStore; runId?: string; projectPath: string }): RemoteFinalRender {
    const usage = input.runId ? input.stateStore.usageTotals(input.runId) : input.stateStore.usageTotals();
    const traceArtifacts = artifactsFromTrace(input.stateStore, input.runId);
    const artifacts = unique([
      ...this.state.artifacts,
      ...traceArtifacts.map((artifact) => artifact.path ? formatArtifact(artifact) : ""),
    ]);
    const assistant = redactRemoteText(this.state.assistant.trim(), 1000);
    const cost = estimateUsageCost(usage, priceConfigFromEnv(process.env, this.model));
    const counts = todoCounts(this.state.todos);
    const hasErrors = this.state.errors.length > 0;
    const unfinished = this.state.todos.filter((todo) => todo.status !== "completed");
    if (!this.isTaskLike(artifacts)) {
      return {
        text: assistant || "我在。",
        markdown: assistant || "我在。",
        artifacts: [],
      };
    }
    const text = this.renderFinalChat({
      artifacts,
      assistant,
      counts,
      hasErrors,
      projectPath: input.projectPath,
      unfinished,
      usage,
      totalCost: cost.totalCost,
      currency: cost.price.currency,
    });
    return {
      text,
      markdown: this.renderDetailedMarkdown({
        artifacts,
        assistant,
        counts,
        hasErrors,
        projectPath: input.projectPath,
        unfinished,
        usage,
        totalCost: cost.totalCost,
        currency: cost.price.currency,
      }),
      artifacts,
    };
  }

  snapshot(): RemoteRenderState {
    return {
      ...this.state,
      tools: [...this.state.tools],
      artifacts: [...this.state.artifacts],
      errors: [...this.state.errors],
      todos: [...this.state.todos],
      usage: this.state.usage ? { ...this.state.usage } : undefined,
    };
  }

  isTaskLike(artifacts: string[] = this.state.artifacts): boolean {
    return Boolean(
      this.state.tools.length ||
      this.state.todos.length ||
      artifacts.length ||
      this.state.errors.length ||
      /approval|permission|tool|artifact|validation|plan gate/i.test(this.state.phase ?? ""),
    );
  }

  private renderProgressCard(): string {
    const counts = todoCounts(this.state.todos);
    const lines = [
      "📍 DeepSeekCode 进度",
      this.state.phase ? `阶段：${compactOneLine(this.state.phase, 100)}` : "阶段：执行中",
      counts.total
        ? `计划：完成 ${counts.completed}/${counts.total}，进行中 ${counts.inProgress}，待做 ${counts.pending}`
        : "计划：正在拆解任务",
      this.state.lastTool ? `最近工具：${this.state.lastTool}` : "",
      this.state.usage ? usageLine(this.state.usage, undefined, "USD") : "",
      this.renderTodoChatSection("进行中", "in_progress", 2),
      this.renderTodoChatSection("待做", "pending", 3),
      this.renderTodoChatSection("已完成", "completed", 3),
      this.state.artifacts.length
        ? ["产物", ...unique(this.state.artifacts).slice(-3).map((item) => `- ${briefPath(item)}`)].join("\n")
        : "",
      this.state.errors.length
        ? ["问题", ...this.state.errors.slice(-2).map((item) => `- ${item}`)].join("\n")
        : "",
    ].filter(Boolean);
    return lines.join("\n");
  }

  private mergeTodos(next: RemoteTodoItem[]): void {
    if (!next.length) return;
    this.state.todos = next;
  }

  private renderTodoSection(
    title: string,
    status: RemoteTodoStatus,
    limit: number,
    includeInProgress = false,
  ): string {
    const items = this.state.todos.filter((todo) => {
      if (includeInProgress) return todo.status === "pending" || todo.status === "in_progress";
      return todo.status === status;
    });
    if (!items.length) return "";
    return [`**${title}**`, ...items.slice(0, limit).map((item) => `- ${item.title}`)].join("\n");
  }

  private renderTodoChatSection(title: string, status: RemoteTodoStatus, limit: number): string {
    const items = this.state.todos.filter((todo) => todo.status === status);
    if (!items.length) return "";
    return [title, ...items.slice(0, limit).map((item) => `- ${item.title}`)].join("\n");
  }

  private renderFinalChat(input: {
    artifacts: string[];
    assistant: string;
    counts: ReturnType<typeof todoCounts>;
    currency: string;
    hasErrors: boolean;
    projectPath: string;
    totalCost: number | undefined;
    unfinished: RemoteTodoItem[];
    usage: UsageTotals;
  }): string {
    const lines = [
      input.hasErrors ? "⚠️ DeepSeekCode 任务需要处理" : "✅ DeepSeekCode 任务完成",
      `项目：${briefPath(input.projectPath)}`,
      input.counts.total
        ? `计划：完成 ${input.counts.completed}/${input.counts.total}，进行中 ${input.counts.inProgress}，待做 ${input.counts.pending}`
        : "",
      this.state.phase ? `阶段：${compactOneLine(this.state.phase, 80)}` : "",
      this.state.lastTool ? `最近：${compactOneLine(this.state.lastTool, 90)}` : "",
      usageLine(input.usage, input.totalCost, input.currency),
      input.artifacts.length
        ? `产物：${input.artifacts.slice(0, 3).map(briefPath).join("；")}`
        : "产物：本轮没有记录到文件",
      input.hasErrors && this.state.errors.length ? `问题：${compactOneLine(this.state.errors[0] ?? "", 120)}` : "",
      !input.hasErrors && input.unfinished.length
        ? `还需跟进：${input.unfinished.slice(0, 2).map((item) => item.title).join("；")}`
        : "",
      input.assistant ? `回复：${compactOneLine(input.assistant, 180)}` : "",
    ].filter(Boolean);
    return lines.slice(0, 10).join("\n");
  }

  private renderDetailedMarkdown(input: {
    artifacts: string[];
    assistant: string;
    counts: ReturnType<typeof todoCounts>;
    currency: string;
    hasErrors: boolean;
    projectPath: string;
    totalCost: number | undefined;
    unfinished: RemoteTodoItem[];
    usage: UsageTotals;
  }): string {
    const lines = [
      "## DeepSeekCode 任务结果",
      "",
      `**状态**：${input.hasErrors ? "有错误需要处理" : "已完成"}`,
      `**项目**：${input.projectPath}`,
      this.state.phase ? `**最后阶段**：${compactOneLine(this.state.phase, 140)}` : "",
      input.counts.total
        ? `**任务进度**：已完成 ${input.counts.completed}/${input.counts.total}，进行中 ${input.counts.inProgress}，待做 ${input.counts.pending}`
        : "",
      this.state.lastTool ? `**最近工具**：${this.state.lastTool}` : "",
      usageLine(input.usage, input.totalCost, input.currency),
      "",
      this.renderTodoSection("已完成", "completed", 6),
      this.renderTodoSection("未完成", "pending", 6, true),
      input.artifacts.length
        ? ["**产物**", ...input.artifacts.slice(0, 8).map((item) => `- ${item}`)].join("\n")
        : "**产物**：本轮没有记录到文件产物",
      input.hasErrors
        ? ["", "**问题**", ...this.state.errors.slice(0, 5).map((item) => `- ${item}`)].join("\n")
        : "",
      !input.hasErrors && input.unfinished.length
        ? ["", "**仍需跟进**", ...input.unfinished.slice(0, 5).map((item) => `- ${item.title}`)].join("\n")
        : "",
      input.assistant ? ["", "**回复**", input.assistant].join("\n") : "",
    ].filter(Boolean);
    return lines.join("\n");
  }
}

function usageLine(usage: UsageTotals, totalCost: number | undefined, currency: string): string {
  return [
    `Token：入 ${usage.inputTokens} / 出 ${usage.outputTokens}`,
    `缓存 ${cacheRate(usage.cacheHitTokens, usage.cacheMissTokens)}`,
    totalCost === undefined ? "" : `费用 ${formatMoney(totalCost, currency)}`,
  ].filter(Boolean).join(" | ");
}

function formatMoney(value: number, currency: string): string {
  return `${currency} ${value.toFixed(6)}`;
}

function extractArtifactPath(text: string): string | undefined {
  const match = text.match(/\b([A-Za-z]:\\[^\s]+|[\w./\\-]+\.(?:html|htm|md|markdown|docx|pptx|pdf|png|jpg|jpeg|webp|xlsx|zip))\b/i);
  return match?.[1];
}

function firstLine(text: string): string {
  return text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? text;
}

function artifactsFromTrace(state: StateStore, runId: string | undefined): TraceArtifact[] {
  if (!runId) return [];
  const trace = state.traceRun(runId) as { artifacts?: TraceArtifact[] };
  return trace.artifacts ?? [];
}

function formatArtifact(artifact: TraceArtifact): string {
  return artifact.path ? `${artifact.path}${artifact.kind ? ` (${artifact.kind})` : ""}` : "";
}

function briefPath(value: string): string {
  const cleaned = value.replace(/\s+\([^)]+\)$/u, "");
  const parts = cleaned.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 2) return cleaned;
  return `${parts.at(-2)}\\${parts.at(-1)}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isImportantPhase(phase: string): boolean {
  return ["tool", "validating", "waiting_user", "finishing", "command"].includes(phase);
}

function todoCounts(todos: RemoteTodoItem[]): { total: number; pending: number; inProgress: number; completed: number } {
  return {
    total: todos.length,
    pending: todos.filter((todo) => todo.status === "pending").length,
    inProgress: todos.filter((todo) => todo.status === "in_progress").length,
    completed: todos.filter((todo) => todo.status === "completed").length,
  };
}

function parseTodos(text: string): RemoteTodoItem[] {
  if (!/todos\s+\S+:/i.test(text)) return [];
  const items: RemoteTodoItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*\d+\.\s+\[([ xX>✓✔-])\]\s+(.+?)(?:\s+\[todo_[^\]]+\])?\s*$/u);
    if (!match) continue;
    const marker = match[1] ?? " ";
    const title = compactOneLine(match[2] ?? "", 120);
    if (!title) continue;
    items.push({
      title,
      status: marker === ">" ? "in_progress" : /[xX✓✔]/u.test(marker) ? "completed" : "pending",
    });
  }
  return items;
}
