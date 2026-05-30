import type { UsageSnapshot } from "../protocol/provider.js";

export type MessageRole = "user" | "assistant" | "system" | "tool" | "error";

export interface Message {
  id: string;
  role: MessageRole;
  text: string;
  createdAtMs: number;
  runId?: string | null;
  usage?: UsageSnapshot;
}

export function isHumanTurn(message: Message): boolean {
  return message.role === "user";
}
