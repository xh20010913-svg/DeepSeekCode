export type MessageRole = "user" | "assistant" | "system" | "tool" | "error";

export interface RuntimeMessage {
  role: MessageRole;
  text: string;
  createdAtMs: number;
  runId?: string | null;
}

export function createRuntimeMessage(
  role: MessageRole,
  text: string,
  runId?: string | null,
): RuntimeMessage {
  return {
    role,
    text,
    runId,
    createdAtMs: Date.now(),
  };
}
