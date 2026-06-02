import type { ActionEnvelope, ActionExecutionReport, ActionRequest } from "../../protocol/actions.js";
import type {
  ActionPlanTurn,
  ChatMessage,
  ChatReply,
  ChatStreamEvent,
  ProviderConfig,
  DeepSeekProviderClient,
  ProviderRequestOptions,
  TurnClassification,
  UsageSnapshot,
  ActionPlanOptions,
} from "../../protocol/provider.js";
import { DeepSeekCodeAbortError, isAbortError, throwIfAborted } from "../../utils/abort.js";
import { baseTools } from "../../tools/registry.js";
import { captureProviderPrompt } from "../telemetry/providerPromptAudit.js";
import {
  envelopeActionsToToolCalls,
  feedbackToUserMessage,
  reportToToolMessages,
  toNativeFunctionTools,
  toolCallsToActions,
  type NativeChatMessage,
  type NativeToolCall,
} from "./toolCalling.js";

interface DeepSeekResponse {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: NativeToolCall[];
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
  private lastReasoning?: string;

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

  async completeChat(messages: ChatMessage[], options: ProviderRequestOptions = {}): Promise<ChatReply> {
    const json = await this.requestJson({
      model: this.config.model,
      messages,
      temperature: 0.3,
      max_tokens: Math.min(this.config.maxOutputTokens ?? 1200, 1200),
    }, options.signal, "chat");
    const message = json.choices?.[0]?.message;
    const usage = usageFromPayload(json.usage);
    this.lastUsage = usage;
    this.lastReasoning = message?.reasoning_content ?? undefined;
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

  takeLastReasoning(): string | undefined {
    const reasoning = this.lastReasoning;
    this.lastReasoning = undefined;
    return reasoning;
  }

  async *streamChat(messages: ChatMessage[], options: ProviderRequestOptions = {}): AsyncGenerator<ChatStreamEvent, void, void> {
    const response = await this.requestRaw({
      model: this.config.model,
      messages,
      temperature: 0.5,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: this.config.maxOutputTokens ?? 1200,
    }, options.signal, "chat_stream");

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
      throwIfAborted(options.signal);
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

  async classifyTurn(input: string, options: ProviderRequestOptions = {}): Promise<TurnClassification> {
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
      maxTokens: Math.min(this.config.maxOutputTokens ?? 1200, 900),
      signal: options.signal,
    });
    return normalizeClassification(reply);
  }

  async planActions(input: {
    userMessage: string;
    systemPrompt: string;
    contextSummary: string;
    feedback?: ActionExecutionReport;
    trajectory?: ActionPlanTurn[];
  }, options: ActionPlanOptions = {}): Promise<ActionEnvelope> {
    const messages = buildNativeToolPlanningMessages(input);
    const json = await this.requestJson({
      model: this.config.model,
      messages,
      tools: toNativeFunctionTools(baseTools),
      tool_choice: "auto",
      temperature: 0.2,
      max_tokens: Math.max(this.config.maxOutputTokens ?? 1200, 2200),
    }, options.signal, "native tool plan");
    const usage = usageFromPayload(json.usage);
    this.lastUsage = usage;
    const message = json.choices?.[0]?.message;
    this.lastReasoning = message?.reasoning_content ?? undefined;
    const toolCalls = message?.tool_calls ?? [];
    if (toolCalls.length > 0) {
      let actions: ActionRequest[];
      try {
        actions = toolCallsToActions(toolCalls);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`DeepSeek native tool call failed local schema validation: ${detail}`);
      }
      return {
        task_kind: "tool_calling",
        needs_local_tools: true,
        acceptance_criteria: [],
        final_message: message?.content?.trim() ?? "",
        continue_work: true,
        remaining_work: "Continue from native tool results.",
        actions,
      };
    }
    const finalText = message?.content?.trim() ?? "";
    if (isInitialLocalToolPlan(input)) {
      throw new Error([
        "DeepSeek native tool calling did not return any tool_calls for a local-tool request.",
        "The selected model or gateway may not support tool calling, or it ignored the tools schema.",
        "DeepSeekCode will not fall back to the old ActionEnvelope JSON planner; switch to a tool-calling model/provider and retry.",
        finalText ? `model_content=${compact(finalText, 300)}` : "",
      ].filter(Boolean).join(" "));
    }
    return {
      task_kind: "chat",
      needs_local_tools: false,
      acceptance_criteria: [],
      final_message: finalText,
      continue_work: false,
      actions: [],
    };
  }

  async completeJson(messages: ChatMessage[], options: {
    label?: string;
    maxTokens?: number;
    signal?: AbortSignal;
  } = {}): Promise<unknown> {
    const maxTokens = options.maxTokens ?? this.config.maxOutputTokens ?? 1200;
    const json = await this.requestJson({
      model: this.config.model,
      messages,
      temperature: 0.2,
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      max_tokens: maxTokens,
    }, options.signal, options.label ?? "json response");
    this.lastUsage = usageFromPayload(json.usage);
    this.lastReasoning = json.choices?.[0]?.message?.reasoning_content ?? undefined;
    const first = parseJsonResponse(json, options.label ?? "json response");
    if (first.ok) return first.value;
    throw new Error(`DeepSeek JSON response invalid: ${first.error}`);
  }

  private async requestJson(
    body: Record<string, unknown>,
    signal?: AbortSignal,
    auditLabel = "json",
  ): Promise<DeepSeekResponse> {
    const response = await this.requestRaw(body, signal, auditLabel);
    try {
      return (await response.json()) as DeepSeekResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`DeepSeek API response was not valid JSON during ${auditLabel}: ${message}`);
    }
  }

  private async requestRaw(
    body: Record<string, unknown>,
    signal?: AbortSignal,
    auditLabel = "request",
  ): Promise<Response> {
    captureProviderPrompt({
      provider: this.config.name,
      model: this.config.model,
      label: auditLabel,
      body,
    });
    const maxAttempts = isStreamingRequest(body) ? 1 : 3;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error("DeepSeek request timed out")), this.config.timeoutSecs * 1000);
      const abortFromCaller = () => controller.abort(new DeepSeekCodeAbortError(signal?.reason));
      if (signal?.aborted) abortFromCaller();
      else signal?.addEventListener("abort", abortFromCaller, { once: true });
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
        if (response.ok) return response;
        const text = await response.text();
        if (attempt < maxAttempts && isRetryableStatus(response.status)) {
          await sleep(retryDelayMs(attempt), signal);
          continue;
        }
        throw new Error(formatApiError(response.status, text, body));
      } catch (error) {
        if (isAbortError(error, signal)) throw error;
        lastError = error;
        if (attempt >= maxAttempts || !isRetryableNetworkError(error)) throw error;
        await sleep(retryDelayMs(attempt), signal);
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abortFromCaller);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "DeepSeek request failed"));
  }
}

function isInitialLocalToolPlan(input: {
  feedback?: ActionExecutionReport;
  trajectory?: ActionPlanTurn[];
}): boolean {
  return !input.feedback && (!input.trajectory || input.trajectory.length === 0);
}

export function buildNativeToolPlanningMessages(input: {
  userMessage: string;
  systemPrompt: string;
  contextSummary: string;
  feedback?: ActionExecutionReport;
  trajectory?: ActionPlanTurn[];
}): NativeChatMessage[] {
  const messages: NativeChatMessage[] = [
    {
      role: "system",
      content: [
        input.systemPrompt,
        "",
        "Native tool calling mode is active.",
        "Use function tool calls for local work, exactly like ClaudeCode emits tool_use blocks.",
        "After tool results, continue with the next useful tool call or provide the final answer.",
        "Use at most 3 tool calls in one assistant turn; split large work into additional turns.",
        "For ordinary chat or a completed task, answer normally without tool calls.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        input.contextSummary ? `Project context:\n${input.contextSummary}` : "",
        `Current user request:\n${input.userMessage}`,
      ].filter(Boolean).join("\n\n"),
    },
  ];

  const turns = (input.trajectory ?? []).slice(-6);
  for (const turn of turns) {
    const toolCalls = envelopeActionsToToolCalls(turn);
    if (toolCalls.length === 0) {
      messages.push({
        role: "assistant",
        content: turn.assistantEnvelope.final_message || "(no tool call)",
      });
      continue;
    }
    messages.push({
      role: "assistant",
      content: turn.assistantEnvelope.final_message || null,
      reasoning_content: turn.reasoning || fallbackToolReasoning(turn),
      tool_calls: toolCalls,
    });
    messages.push(...reportToToolMessages(turn));
  }

  const feedbackAlreadyInTrajectory = turns.some((turn) => turn.toolReport === input.feedback);
  if (input.feedback && !feedbackAlreadyInTrajectory) {
    messages.push({
      role: "user",
      content: feedbackToUserMessage(input.feedback),
    });
  }
  return messages;
}

type JsonParseResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

function parseJsonResponse(json: DeepSeekResponse, label: string): JsonParseResult {
  const choice = json.choices?.[0];
  const content = stripJsonFence(choice?.message?.content ?? "");
  const reasoningChars = choice?.message?.reasoning_content?.length ?? 0;
  const finish = choice?.finish_reason ?? "unknown";
  return parseJsonText(content, { label, finish, reasoningChars });
}

function parseJsonText(
  text: string,
  meta: {
    label: string;
    finish: string | null;
    reasoningChars: number;
  },
): JsonParseResult {
  const content = stripJsonFence(text);
  if (!content.trim()) {
    return {
      ok: false,
      error: `${meta.label} was empty finish=${meta.finish ?? "unknown"} reasoningChars=${meta.reasoningChars}`,
    };
  }
  try {
    return { ok: true, value: JSON.parse(content) };
  } catch (error) {
    const balanced = extractFirstJsonObject(content);
    if (balanced && balanced !== content) {
      try {
        return { ok: true, value: JSON.parse(balanced) };
      } catch {
        // Preserve the original parse error below; the extracted object was
        // only a best-effort recovery path for trailing prose or duplicate JSON.
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `${meta.label} parse failed: ${message} finish=${meta.finish ?? "unknown"} contentChars=${content.length} head=${JSON.stringify(compact(content, 160))}`,
    };
  }
}

function extractFirstJsonObject(text: string): string | undefined {
  const start = text.indexOf("{");
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaping = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return undefined;
}

function endpointFor(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function isStreamingRequest(body: Record<string, unknown>): boolean {
  return body.stream === true;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function retryDelayMs(attempt: number): number {
  return Math.min(2_000, 250 * 2 ** Math.max(0, attempt - 1));
}

function isRetryableNetworkError(error: unknown): boolean {
  if (error instanceof DeepSeekCodeAbortError) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|network|socket|econnreset|econnrefused|etimedout|timeout|terminated/i.test(message);
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  if (signal?.aborted) throw new DeepSeekCodeAbortError(signal.reason);
  await new Promise<void>((resolve, reject) => {
    const done = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const timer = setTimeout(done, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DeepSeekCodeAbortError(signal?.reason));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function formatApiError(status: number, text: string, body: Record<string, unknown>): string {
  const hasTools = Array.isArray(body.tools);
  const label = hasTools ? "native tool calling request" : "request";
  const detail = compact(text || "(empty response body)", 1_000);
  const hint = apiErrorHint(status, hasTools, text);
  return [`DeepSeek API ${status} failed during ${label}: ${detail}`, hint].filter(Boolean).join(" ");
}

function apiErrorHint(status: number, hasTools: boolean, text = ""): string {
  if (status === 400 && /reasoning_content/i.test(text)) {
    return "DeepSeek thinking mode requires assistant reasoning_content to be replayed with prior tool calls.";
  }
  if (status === 400 && hasTools) {
    return "The selected model or gateway rejected the tools schema; choose a tool-calling model or reduce/repair the schema.";
  }
  if (status === 401 || status === 403) {
    return "Check the configured API key and provider permissions.";
  }
  if (status === 404 && hasTools) {
    return "The selected provider endpoint may not support chat/completions tool calling.";
  }
  if (status === 429) {
    return "Rate limited; DeepSeekCode retried network-safe attempts and then stopped.";
  }
  if (status >= 500) {
    return "Provider-side error; retry later or switch model/provider.";
  }
  return "";
}

function fallbackToolReasoning(turn: ActionPlanTurn): string {
  return turn.note
    ? `DeepSeekCode replayed a compact local tool turn: ${compact(turn.note, 240)}`
    : "DeepSeekCode replayed a compact local tool turn for native tool-result continuity.";
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
