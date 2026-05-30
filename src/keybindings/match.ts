import { normalizeKey } from "./parser.js";
import type { ParsedKeystroke } from "./types.js";

export interface RuntimeKey {
  name?: string;
  input?: string;
  ctrl?: boolean;
  alt?: boolean;
  meta?: boolean;
  shift?: boolean;
}

export function matchKeystroke(expected: ParsedKeystroke, actual: RuntimeKey): boolean {
  const actualKey = normalizeKey(actual.name ?? actual.input ?? "");
  return actualKey === normalizeKey(expected.key ?? "") &&
    Boolean(actual.ctrl) === Boolean(expected.ctrl) &&
    Boolean(actual.alt) === Boolean(expected.alt) &&
    Boolean(actual.meta) === Boolean(expected.meta) &&
    Boolean(actual.shift) === Boolean(expected.shift);
}

export function matchShortcut(expected: ParsedKeystroke[], actual: RuntimeKey[]): boolean {
  return expected.length === actual.length && expected.every((key, index) => matchKeystroke(key, actual[index] ?? {}));
}
