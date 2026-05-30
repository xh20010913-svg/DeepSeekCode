import { truncateCells } from "../design/textLayout.js";
import { normalizePromptInputMode, promptInputModePrefix, type PromptInputMode } from "./inputModes.js";

export function promptInputLabel(mode: string | undefined): string {
  const normalized = normalizePromptInputMode(mode);
  return `${promptInputModePrefix(normalized)} ${normalized}`;
}

export function truncatePromptForFooter(value: string, width = 80): string {
  return truncateCells(value.replace(/\s+/g, " ").trim(), width);
}

export function isPromptMode(value: string | undefined, mode: PromptInputMode): boolean {
  return normalizePromptInputMode(value) === mode;
}
