import { parseShortcut } from "./parser.js";
import { formatShortcut } from "./shortcutFormat.js";
import type { KeybindingAction, KeybindingBlock, KeybindingContextName, ParsedBinding } from "./types.js";

export function normalizeBindingBlocks(blocks: KeybindingBlock[]): Array<KeybindingBlock & { bindings: ParsedBinding[] }> {
  return blocks.map((block) => ({
    context: block.context ?? "Global",
    bindings: normalizeBindings(block.bindings ?? {}),
  }));
}

export function normalizeBindings(bindings: KeybindingBlock["bindings"]): ParsedBinding[] {
  if (Array.isArray(bindings)) return bindings;
  return Object.entries(bindings ?? {}).map(([shortcut, action]) => ({
    action,
    keys: parseShortcut(shortcut),
    source: shortcut,
  }));
}

export function getBindingDisplayText(
  action: KeybindingAction,
  context: KeybindingContextName,
  blocks: KeybindingBlock[],
): string | undefined {
  for (const block of normalizeBindingBlocks(blocks)) {
    if (block.context !== context && block.context !== "Global") continue;
    const found = block.bindings.find((binding) => binding.action === action);
    if (found?.source) return formatShortcut(found.source);
  }
  return undefined;
}

export function resolveAction(
  shortcut: string,
  context: KeybindingContextName,
  blocks: KeybindingBlock[],
): KeybindingAction | undefined {
  const normalizedShortcut = formatShortcut(shortcut).toLowerCase();
  for (const block of normalizeBindingBlocks(blocks)) {
    if (block.context !== context && block.context !== "Global") continue;
    const found = block.bindings.find((binding) => formatShortcut(binding.source ?? "").toLowerCase() === normalizedShortcut);
    if (found) return found.action;
  }
  return undefined;
}
