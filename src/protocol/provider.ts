import type { ActionEnvelope, ActionExecutionReport } from "./actions.js";

export type ProviderKind = "open_ai_compatible";

export interface ProviderConfig {
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutSecs: number;
  reasoningEffort?: string;
  maxOutputTokens?: number;
}

export interface UsageSnapshot {
  inputTokens?: number;
  outputTokens?: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatReply extends UsageSnapshot {
  provider: string;
  model: string;
  text: string;
  reasoning?: string;
}

export type ChatStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "reasoning_delta"; text: string }
  | ({ type: "usage" } & UsageSnapshot);

export interface TurnClassification {
  task_kind: string;
  needs_local_tools: boolean;
  reason: string;
}

export interface ActionPlanTurn {
  attempt: number;
  assistantEnvelope: ActionEnvelope;
  toolReport: ActionExecutionReport;
  note?: string;
}

export interface ActionPlanOptions {
  onReasoningDelta?: (text: string) => void;
}

export interface DeepSeekProviderClient {
  providerName: string;
  model: string;
  verifyModel(): Promise<ChatReply>;
  completeChat(messages: ChatMessage[]): Promise<ChatReply>;
  streamChat(messages: ChatMessage[]): AsyncGenerator<ChatStreamEvent, void, void>;
  classifyTurn(input: string): Promise<TurnClassification>;
  planActions(input: {
    userMessage: string;
    systemPrompt: string;
    contextSummary: string;
    feedback?: ActionExecutionReport;
    trajectory?: ActionPlanTurn[];
  }, options?: ActionPlanOptions): Promise<ActionEnvelope>;
  takeLastReasoning?(): string | undefined;
  takeLastUsage(): UsageSnapshot | undefined;
}
