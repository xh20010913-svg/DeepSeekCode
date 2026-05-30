import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_BINDINGS } from "./defaultBindings.js";
import { parseKeybindingConfig } from "./schema.js";
import type { KeybindingBlock } from "./types.js";

export function keybindingsPath(projectPath = process.cwd()): string {
  return join(projectPath, ".deepseekcode", "keybindings.json");
}

export function loadKeybindingsSync(projectPath = process.cwd()): KeybindingBlock[] {
  const path = keybindingsPath(projectPath);
  if (!existsSync(path)) return DEFAULT_BINDINGS;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return [...DEFAULT_BINDINGS, ...parseKeybindingConfig(parsed)];
  } catch {
    return DEFAULT_BINDINGS;
  }
}
