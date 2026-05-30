import { parseShortcut } from "./parser.js";
import { isReservedShortcut } from "./reservedShortcuts.js";
import type { KeybindingBlock, KeybindingValidationMessage } from "./types.js";

export function validateKeybindings(blocks: KeybindingBlock[]): KeybindingValidationMessage[] {
  const messages: KeybindingValidationMessage[] = [];
  const seen = new Map<string, string>();
  for (const block of blocks) {
    const context = block.context ?? "Global";
    const entries = Array.isArray(block.bindings)
      ? block.bindings.map((binding) => [binding.source ?? "", binding.action] as const)
      : Object.entries(block.bindings ?? {});
    for (const [shortcut, action] of entries) {
      try {
        parseShortcut(shortcut);
      } catch (error) {
        messages.push({
          severity: "error",
          message: `Invalid shortcut "${shortcut}" for ${action}`,
          suggestion: error instanceof Error ? error.message : "Use a chord like ctrl+o or ctrl+x ctrl+k.",
        });
        continue;
      }
      const key = `${context}:${shortcut.toLowerCase()}`;
      const previous = seen.get(key);
      if (previous) {
        messages.push({
          severity: "warning",
          message: `Duplicate shortcut "${shortcut}" in ${context}`,
          suggestion: `${previous} and ${action} share the same key sequence.`,
        });
      }
      seen.set(key, action);
      if (isReservedShortcut(shortcut)) {
        messages.push({
          severity: "error",
          message: `Reserved shortcut "${shortcut}" cannot be rebound`,
          suggestion: "Keep process-level interrupt/exit keys stable on Windows terminals.",
        });
      }
    }
  }
  return messages;
}
