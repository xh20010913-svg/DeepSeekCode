import { parseShortcut } from "./parser.js";
import type { KeybindingContextName, ParsedKeystroke } from "./types.js";
import { loadKeybindingsSync } from "./loadUserBindings.js";
import { getBindingDisplayText } from "./resolver.js";

export function formatKeystroke(key: ParsedKeystroke): string {
  const parts = [
    key.ctrl ? "Ctrl" : "",
    key.alt ? "Alt" : "",
    key.shift ? "Shift" : "",
    key.meta ? "Meta" : "",
    displayKey(key.key ?? ""),
  ].filter(Boolean);
  return parts.join("+");
}

export function formatShortcut(shortcut: string): string {
  try {
    return parseShortcut(shortcut).map(formatKeystroke).join(" ");
  } catch {
    return shortcut;
  }
}

export function getShortcutDisplay(
  action: string,
  context: KeybindingContextName,
  fallback: string,
): string {
  return getBindingDisplayText(action, context, loadKeybindingsSync()) ?? formatShortcut(fallback);
}

function displayKey(key: string): string {
  if (key.length === 1) return key.toUpperCase();
  return key.slice(0, 1).toUpperCase() + key.slice(1);
}
