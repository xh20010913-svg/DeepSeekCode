import type { KeybindingBlock } from "./types.js";

export function isKeybindingBlock(value: unknown): value is KeybindingBlock {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.bindings === undefined || typeof record.bindings === "object";
}

export function parseKeybindingConfig(value: unknown): KeybindingBlock[] {
  if (Array.isArray(value)) return value.filter(isKeybindingBlock);
  if (isKeybindingBlock(value)) return [value];
  return [];
}
