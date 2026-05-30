import { normalizePromptInputMode } from "./inputModes.js";

export function usePromptInputPlaceholder(mode: string | undefined, providerReady = true): string {
  if (!providerReady) return "Run /doctor to configure provider";
  const normalized = normalizePromptInputMode(mode);
  if (normalized === "shell") return "Type a shell command";
  if (normalized === "agent") return "Delegate to an agent";
  return "Type a message";
}
