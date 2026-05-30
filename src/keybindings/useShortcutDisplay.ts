import { useKeybinding } from "./useKeybinding.js";
import { formatShortcut } from "./shortcutFormat.js";

export function useShortcutDisplay(action: string, context: string, fallback: string): string {
  return useKeybinding(action, context) ?? formatShortcut(fallback);
}
