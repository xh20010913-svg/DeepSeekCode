import { cacheRate } from "../query/promptCache.js";
import type { QueryEvent } from "../query/QueryEngine.js";
import { estimateUsageCost, priceConfigFromEnv } from "../services/cost/costEstimate.js";
import type { StateStore, UsageTotals } from "../state/sqlite.js";
import { compactOneLine, redactRemoteText } from "./redact.js";

export interface RemoteRenderState {
  phase?: string;
  lastTool?: string;
  tools: string[];
  artifacts: string[];
  errors: string[];
  assistant: string;
}

export class RemoteReplyRenderer {
  private readonly state: RemoteRenderState = {
    tools: [],
    artifacts: [],
    errors: [],
    assistant: "",
  };

  constructor(private readonly model: string) {}

  accept(event: QueryEvent): string | undefined {
    if (event.type === "status") {
      this.state.phase = event.detail ? `${event.text}: ${event.detail}` : event.text;
      return `**阶段**：${compactOneLine(this.state.phase, 120)}`;
    }
    if (event.type === "tool_start") {
      this.state.lastTool = compactOneLine(event.text, 120);
      this.state.tools.push(this.state.lastTool);
      return `**工具**：${this.state.lastTool}`;
    }
    if (event.type === "tool_result") {
      const line = compactOneLine(event.text, 180);
      this.state.tools.push(line);
      const artifact = extractArtifactPath(event.text);
      if (artifact) this.state.artifacts.push(artifact);
      return `**结果**：${line}`;
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
      return `**错误**：${line}`;
    }
    if (event.type === "command") {
      return `**消息**：${compactOneLine(event.text, 220)}`;
    }
    return undefined;
  }

  final(input: { stateStore: StateStore; runId?: string; projectPath: string }): string {
    const usage = input.runId ? input.stateStore.usageTotals(input.runId) : input.stateStore.usageTotals();
    const artifacts = unique([
      ...this.state.artifacts,
      ...artifactsFromTrace(input.stateStore, input.runId),
    ]);
    const assistant = redactRemoteText(this.state.assistant.trim(), 1000);
    const cost = estimateUsageCost(usage, priceConfigFromEnv(process.env, this.model));
    const lines = [
      "## DeepSeekCode 任务结果",
      "",
      this.state.errors.length ? "**状态**：有错误需要处理" : "**状态**：已完成",
      `**项目**：${input.projectPath}`,
      this.state.phase ? `**最后阶段**：${compactOneLine(this.state.phase, 140)}` : "",
      this.state.lastTool ? `**最近工具**：${this.state.lastTool}` : "",
      "",
      usageLine(usage, cost.totalCost, cost.price.currency),
      "",
      artifacts.length
        ? ["**产物**", ...artifacts.slice(0, 8).map((item) => `- ${item}`)].join("\n")
        : "**产物**：本轮没有记录到文件产物",
      this.state.errors.length
        ? ["", "**问题**", ...this.state.errors.slice(0, 5).map((item) => `- ${item}`)].join("\n")
        : "",
      assistant ? ["", "**回复**", assistant].join("\n") : "",
    ].filter(Boolean);
    return lines.join("\n");
  }

  snapshot(): RemoteRenderState {
    return {
      ...this.state,
      tools: [...this.state.tools],
      artifacts: [...this.state.artifacts],
      errors: [...this.state.errors],
    };
  }
}

function usageLine(usage: UsageTotals, totalCost: number | undefined, currency: string): string {
  return [
    `**Token**：输入 ${usage.inputTokens}，输出 ${usage.outputTokens}`,
    `缓存 ${cacheRate(usage.cacheHitTokens, usage.cacheMissTokens)}`,
    totalCost === undefined ? "费用未配置" : `估算 ${formatMoney(totalCost, currency)}`,
  ].join(" | ");
}

function formatMoney(value: number, currency: string): string {
  return `${currency} ${value.toFixed(6)}`;
}

function extractArtifactPath(text: string): string | undefined {
  const first = text.split(/\r?\n/)[0] ?? "";
  const match = first.match(/\b([A-Za-z]:\\[^\s]+|[\w./-]+\.(?:html|md|docx|pptx|pdf|png|jpg|jpeg|webp))\b/i);
  return match?.[1];
}

function artifactsFromTrace(state: StateStore, runId: string | undefined): string[] {
  if (!runId) return [];
  const trace = state.traceRun(runId) as { artifacts?: Array<{ path?: string; kind?: string }> };
  return (trace.artifacts ?? [])
    .map((artifact) => artifact.path ? `${artifact.path}${artifact.kind ? ` (${artifact.kind})` : ""}` : "")
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
