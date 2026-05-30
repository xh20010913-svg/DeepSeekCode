import {
  ActionEnvelopeSchema,
  type ActionEnvelope,
  type ActionExecutionReport,
  type ActionRequest,
} from "../../protocol/actions.js";
import type {
  ActionPlanTurn,
  ChatMessage,
  ChatReply,
  ChatStreamEvent,
  ProviderConfig,
  DeepSeekProviderClient,
  TurnClassification,
  UsageSnapshot,
} from "../../protocol/provider.js";

interface DeepSeekResponse {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
    };
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
    };
  }>;
  usage?: UsagePayload | null;
  model?: string;
}

interface UsagePayload {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
}

export class DeepSeekClient implements DeepSeekProviderClient {
  private lastUsage?: UsageSnapshot;

  constructor(private readonly config: ProviderConfig) {}

  get providerName(): string {
    return this.config.name;
  }

  get model(): string {
    return this.config.model;
  }

  async verifyModel(): Promise<ChatReply> {
    return this.completeChat([
      { role: "system", content: "You are a terse health-check responder." },
      { role: "user", content: "Reply with exactly: ok" },
    ]);
  }

  async completeChat(messages: ChatMessage[]): Promise<ChatReply> {
    const json = await this.requestJson({
      model: this.config.model,
      messages,
      temperature: 0.3,
      max_tokens: Math.min(this.config.maxOutputTokens ?? 1200, 1200),
    });
    const message = json.choices?.[0]?.message;
    const usage = usageFromPayload(json.usage);
    this.lastUsage = usage;
    return {
      provider: this.config.name,
      model: json.model ?? this.config.model,
      text: message?.content ?? "",
      reasoning: message?.reasoning_content ?? undefined,
      ...usage,
    };
  }

  takeLastUsage(): UsageSnapshot | undefined {
    const usage = this.lastUsage;
    this.lastUsage = undefined;
    return usage;
  }

  async *streamChat(messages: ChatMessage[]): AsyncGenerator<ChatStreamEvent, void, void> {
    const response = await this.requestRaw({
      model: this.config.model,
      messages,
      temperature: 0.5,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: this.config.maxOutputTokens ?? 1200,
    });

    if (!response.body) throw new Error("DeepSeek stream response has no body");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const dataLines: string[] = [];

    const flushEvent = function* (): Generator<ChatStreamEvent> {
      const event = dataLines.join("\n").trim();
      dataLines.length = 0;
      if (!event || event === "[DONE]") return;
      let chunk: DeepSeekResponse;
      try {
        chunk = JSON.parse(event) as DeepSeekResponse;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid DeepSeek stream event: ${message}; data=${compact(event, 240)}`);
      }
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.reasoning_content) {
        yield { type: "reasoning_delta", text: delta.reasoning_content };
      }
      if (delta?.content) {
        yield { type: "text_delta", text: delta.content };
      }
      if (chunk.usage) {
        yield { type: "usage", ...usageFromPayload(chunk.usage) };
      }
    };

    const readLine = function* (line: string): Generator<ChatStreamEvent> {
      const trimmed = line.trimEnd();
      if (!trimmed) {
        yield* flushEvent();
        return;
      }
      if (trimmed.startsWith(":")) return;
      if (!trimmed.startsWith("data:")) return;
      dataLines.push(trimmed.slice("data:".length).trimStart());
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        yield* readLine(line);
      }
    }
    buffer += decoder.decode();
    if (buffer) {
      yield* readLine(buffer);
    }
    yield* flushEvent();
  }

  async classifyTurn(input: string): Promise<TurnClassification> {
    const reply = await this.completeJson([
      {
        role: "system",
        content:
          "Return json only. Classify the user request for a local coding agent. " +
          "Do not decide by keywords alone. If local files, commands, browser, docs, or multi-agent work are needed, set needs_local_tools true.",
      },
      {
        role: "user",
        content:
          `User request:\n${input}\n\n` +
          'Return json like {"task_kind":"chat|clarification|file_change|command|browser|document|research|multi_agent|computer_use|other","needs_local_tools":false,"reason":"short reason"}.',
      },
    ], {
      label: "turn classification",
      maxTokens: Math.min(this.config.maxOutputTokens ?? 1200, 500),
    });
    return normalizeClassification(reply);
  }

  async planActions(input: {
    userMessage: string;
    systemPrompt: string;
    contextSummary: string;
    feedback?: ActionExecutionReport;
    trajectory?: ActionPlanTurn[];
  }): Promise<ActionEnvelope> {
    const feedback = formatActionFeedback(input.trajectory ?? [], input.feedback);
    const reply = await this.completeJson([
      { role: "system", content: input.systemPrompt },
      {
        role: "user",
        content:
          "You must return json only and it must be an ActionEnvelope.\n\n" +
          `Project context:\n${input.contextSummary}\n\n` +
          `${feedback}\n\n` +
          `Current user request:\n${input.userMessage}`,
      },
    ], {
      label: "action plan",
      maxTokens: Math.max(this.config.maxOutputTokens ?? 1200, 2200),
    });
    return ActionEnvelopeSchema.parse(reply);
  }

  async completeJson(messages: ChatMessage[], options: {
    label?: string;
    maxTokens?: number;
  } = {}): Promise<unknown> {
    const maxTokens = options.maxTokens ?? this.config.maxOutputTokens ?? 1200;
    const json = await this.requestJson({
      model: this.config.model,
      messages,
      temperature: 0.2,
      response_format: { type: "json_object" },
      max_tokens: maxTokens,
    });
    this.lastUsage = usageFromPayload(json.usage);
    const first = parseJsonResponse(json, options.label ?? "json response");
    if (first.ok) return first.value;

    const repair = await this.requestJson({
      model: this.config.model,
      messages: [
        ...messages,
        {
          role: "user",
          content:
            "The previous response was not valid JSON. " +
            `Reason: ${first.error}. ` +
            "Return exactly one compact valid JSON object now. No markdown, no comments, no prose. " +
            repairSizeGuidance(first.error),
        },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
      max_tokens: Math.min(4096, Math.max(maxTokens * 2, 1200)),
    });
    this.lastUsage = mergeUsage(this.lastUsage, usageFromPayload(repair.usage));
    const second = parseJsonResponse(repair, `${options.label ?? "json response"} repair`);
    if (second.ok) return second.value;

    throw new Error(
      `DeepSeek JSON response invalid after retry: ${first.error}; retry: ${second.error}`,
    );
  }

  private async requestJson(body: Record<string, unknown>): Promise<DeepSeekResponse> {
    const response = await this.requestRaw(body);
    return (await response.json()) as DeepSeekResponse;
  }

  private async requestRaw(body: Record<string, unknown>): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutSecs * 1000);
    try {
      const response = await fetch(endpointFor(this.config.baseUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`DeepSeek API ${response.status}: ${compact(text, 1000)}`);
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
}

type JsonParseResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

function parseJsonResponse(json: DeepSeekResponse, label: string): JsonParseResult {
  const choice = json.choices?.[0];
  const content = stripJsonFence(choice?.message?.content ?? "");
  const reasoningChars = choice?.message?.reasoning_content?.length ?? 0;
  const finish = choice?.finish_reason ?? "unknown";
  if (!content.trim()) {
    return {
      ok: false,
      error: `${label} was empty finish=${finish} reasoningChars=${reasoningChars}`,
    };
  }
  try {
    return { ok: true, value: JSON.parse(content) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `${label} parse failed: ${message} finish=${finish} contentChars=${content.length} head=${JSON.stringify(compact(content, 160))}`,
    };
  }
}

function endpointFor(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function usageFromPayload(payload?: UsagePayload | null): UsageSnapshot {
  if (!payload) return {};
  return {
    inputTokens: payload.prompt_tokens,
    outputTokens: payload.completion_tokens,
    cacheHitTokens:
      payload.prompt_cache_hit_tokens ?? payload.prompt_tokens_details?.cached_tokens,
    cacheMissTokens: payload.prompt_cache_miss_tokens,
  };
}

function mergeUsage(left: UsageSnapshot | undefined, right: UsageSnapshot): UsageSnapshot {
  if (!left) return right;
  return {
    inputTokens: addOptional(left.inputTokens, right.inputTokens),
    outputTokens: addOptional(left.outputTokens, right.outputTokens),
    cacheHitTokens: addOptional(left.cacheHitTokens, right.cacheHitTokens),
    cacheMissTokens: addOptional(left.cacheMissTokens, right.cacheMissTokens),
  };
}

function addOptional(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return left + right;
}

function normalizeClassification(value: unknown): TurnClassification {
  const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    task_kind: typeof candidate.task_kind === "string" ? candidate.task_kind : "chat",
    needs_local_tools: Boolean(candidate.needs_local_tools),
    reason: typeof candidate.reason === "string" ? candidate.reason : "model classification",
  };
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : trimmed;
}

function compact(text: string, max: number): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

function formatActionFeedback(
  trajectory: ActionPlanTurn[],
  fallback?: ActionExecutionReport,
): string {
  if (trajectory.length === 0) {
    return fallback
      ? `Previous tool feedback json:\n${JSON.stringify(compactReport(fallback))}`
      : "No previous tool feedback.";
  }
  const turns = trajectory.slice(-6).map((turn) => ({
    attempt: turn.attempt,
    assistant_action_envelope: {
      task_kind: turn.assistantEnvelope.task_kind,
      needs_local_tools: turn.assistantEnvelope.needs_local_tools,
      acceptance_criteria: turn.assistantEnvelope.acceptance_criteria,
      final_message: compact(turn.assistantEnvelope.final_message ?? "", 360),
      continue_work: turn.assistantEnvelope.continue_work ?? false,
      remaining_work: compact(turn.assistantEnvelope.remaining_work ?? "", 360),
      actions: turn.assistantEnvelope.actions.map(summarizeAction),
    },
    tool_result: compactReport(turn.toolReport),
    note: turn.note,
  }));
  return [
    "Previous assistant/tool trajectory follows.",
    "Treat each assistant_action_envelope as the previous assistant tool_use and each tool_result as the runtime result.",
    "Continue from these results exactly; do not claim completion unless the trajectory shows required file changes or validation.",
    JSON.stringify(turns, null, 2),
  ].join("\n");
}

function compactReport(report: ActionExecutionReport): ActionExecutionReport {
  return {
    status: report.status,
    final_message: compact(report.final_message ?? "", 500),
    results: report.results.map((result) => ({
      ...result,
      message: result.message ? compact(result.message, 900) : result.message,
    })),
  };
}

function summarizeAction(action: ActionRequest): Record<string, unknown> {
  const candidate = action as Record<string, unknown>;
  const summary: Record<string, unknown> = { type: action.type };
  for (const key of ["path", "pattern", "include", "command", "cwd", "profile", "server", "tool", "expected_kind", "scope", "goal"]) {
    if (candidate[key] !== undefined) summary[key] = candidate[key];
  }
  if (typeof candidate.content === "string") {
    summary.content_chars = candidate.content.length;
    summary.content_head = compact(candidate.content, 160);
  }
  if (Array.isArray(candidate.edits)) {
    summary.edits = candidate.edits.length;
  }
  return summary;
}

function repairSizeGuidance(error: string): string {
  if (!/finish=length|Unterminated string|Unexpected end|contentChars=/i.test(error)) return "";
  return [
    "The previous JSON was probably truncated.",
    "If this is an ActionEnvelope, return a smaller batch:",
    "at most 3 actions, write_file content under 2500 chars, final_message under 300 chars,",
    "and set continue_work=true with remaining_work for the next batch instead of emitting everything now.",
  ].join(" ");
}
