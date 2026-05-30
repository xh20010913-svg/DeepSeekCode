export type PromptInputMode = "prompt" | "shell" | "agent";

export function normalizePromptInputMode(value: string | undefined): PromptInputMode {
  if (value === "shell" || value === "agent") return value;
  return "prompt";
}

export function promptInputModePrefix(mode: PromptInputMode): string {
  if (mode === "shell") return "$";
  if (mode === "agent") return "@";
  return ">";
}
