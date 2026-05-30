import type { ParsedKeystroke } from "./types.js";

const MODIFIERS = new Set(["ctrl", "control", "alt", "option", "shift", "meta", "cmd", "command"]);

export function parseShortcut(shortcut: string): ParsedKeystroke[] {
  const chords = shortcut.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (chords.length === 0) throw new Error("Shortcut is empty");
  return chords.map(parseChord);
}

export function parseChord(chord: string): ParsedKeystroke {
  const parts = chord.split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error("Shortcut chord is empty");
  const key: ParsedKeystroke = {};
  for (const part of parts) {
    if (!MODIFIERS.has(part)) {
      if (key.key) throw new Error(`Shortcut chord has multiple keys: ${chord}`);
      key.key = normalizeKey(part);
      continue;
    }
    if (part === "ctrl" || part === "control") key.ctrl = true;
    if (part === "alt" || part === "option") key.alt = true;
    if (part === "shift") key.shift = true;
    if (part === "meta" || part === "cmd" || part === "command") key.meta = true;
  }
  if (!key.key) throw new Error(`Shortcut chord is missing a key: ${chord}`);
  return key;
}

export function normalizeKey(key: string): string {
  const normalized = key.toLowerCase();
  if (normalized === "return") return "enter";
  if (normalized === "esc") return "escape";
  if (normalized === "spacebar") return "space";
  return normalized;
}
