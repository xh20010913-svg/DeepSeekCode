import crypto from "node:crypto";
import type { Tools } from "../Tool.js";

export interface StablePromptBlock {
  text: string;
  hash: string;
  approxTokens: number;
}

export function buildStablePromptBlock(parts: Array<{ title: string; body: string }>): StablePromptBlock {
  const text = parts
    .map((part) => [`<${part.title}>`, normalizeStableText(part.body), `</${part.title}>`].join("\n"))
    .join("\n\n");
  return {
    text,
    hash: crypto.createHash("sha256").update(text).digest("hex").slice(0, 16),
    approxTokens: approximateTokens(text),
  };
}

export interface PrefixFingerprint {
  systemSha256: string;
  toolsSha256: string;
  combinedSha256: string;
}

export interface PrefixDrift {
  previous: PrefixFingerprint;
  current: PrefixFingerprint;
  systemChanged: boolean;
  toolsChanged: boolean;
  label: "system" | "tools" | "system+tools" | "unknown";
}

export class PrefixStabilityManager {
  private pinned?: PrefixFingerprint;
  private current?: PrefixFingerprint;
  private changes = 0;
  private checks = 0;
  private last?: PrefixDrift;

  check(systemText: string, tools: Tools): { stable: true; fingerprint: PrefixFingerprint } | { stable: false; drift: PrefixDrift } {
    const next = computePrefixFingerprint(systemText, tools);
    this.checks += 1;
    if (!this.pinned) {
      this.pinned = next;
      this.current = next;
      return { stable: true, fingerprint: next };
    }
    const previous = this.current ?? this.pinned;
    this.current = next;
    if (next.combinedSha256 === this.pinned.combinedSha256) {
      return { stable: true, fingerprint: next };
    }

    const systemChanged = next.systemSha256 !== this.pinned.systemSha256;
    const toolsChanged = next.toolsSha256 !== this.pinned.toolsSha256;
    const drift: PrefixDrift = {
      previous,
      current: next,
      systemChanged,
      toolsChanged,
      label: systemChanged && toolsChanged
        ? "system+tools"
        : systemChanged
          ? "system"
          : toolsChanged
            ? "tools"
            : "unknown",
    };
    this.last = drift;
    this.changes += 1;
    this.pinned = next;
    return { stable: false, drift };
  }

  snapshot(): { checks: number; changes: number; stableRatio: number; last?: PrefixDrift } {
    const stableChecks = Math.max(0, this.checks - this.changes);
    return {
      checks: this.checks,
      changes: this.changes,
      stableRatio: this.checks > 0 ? stableChecks / this.checks : 1,
      last: this.last,
    };
  }
}

export function computePrefixFingerprint(systemText: string, tools: Tools): PrefixFingerprint {
  const systemSha256 = sha256(systemText);
  const toolNames = tools.map((tool) => tool.name).sort().join(",");
  const toolsSha256 = sha256(toolNames);
  return {
    systemSha256,
    toolsSha256,
    combinedSha256: sha256(`${systemSha256}:${toolsSha256}`),
  };
}

export function buildDynamicPromptBlock(parts: Array<{ title: string; body: string }>): string {
  return parts
    .map((part) => [`<${part.title}>`, part.body.trim(), `</${part.title}>`].join("\n"))
    .join("\n\n");
}

export function cacheRate(hit?: number, miss?: number): string {
  const h = hit ?? 0;
  const m = miss ?? 0;
  const total = h + m;
  if (total <= 0) return "n/a";
  return `${Math.round((h / total) * 100)}%`;
}

export function approximateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function normalizeStableText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}
