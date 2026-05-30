import { createHash } from "node:crypto";
import type { CachePin } from "./cachePins.js";
import { CachePinService } from "./cachePins.js";

export type CachePinAuditSeverity = "ok" | "warning" | "error";

export interface CachePinAuditItem {
  pin: string;
  severity: CachePinAuditSeverity;
  code: string;
  message: string;
}

export interface CachePinAuditReport {
  pinCount: number;
  totalChars: number;
  severity: CachePinAuditSeverity;
  items: CachePinAuditItem[];
  recommendation: string;
}

const LARGE_PIN_CHARS = 4_000;
const LARGE_TOTAL_CHARS = 12_000;
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9]{16,}/,
  /\b(api[_-]?key|token|secret|password|authorization)\b\s*[:=]\s*(?!\[?redacted\]?)[^\s"']+/i,
  /\bbearer\s+(?!\[?redacted\]?)[A-Za-z0-9._-]{12,}/i,
];

export function auditCachePins(projectPath: string): CachePinAuditReport {
  return auditCachePinList(new CachePinService(projectPath).list());
}

export function auditCachePinList(pins: CachePin[]): CachePinAuditReport {
  const items: CachePinAuditItem[] = [];
  const totalChars = pins.reduce((sum, pin) => sum + pin.chars, 0);
  if (pins.length === 0) {
    return {
      pinCount: 0,
      totalChars: 0,
      severity: "ok",
      items: [],
      recommendation: "No cache pins yet. Use /cache pin suggest or /cache pin from <file> to add stable project facts.",
    };
  }

  const byHash = new Map<string, CachePin[]>();
  for (const pin of pins) {
    if (pin.chars > LARGE_PIN_CHARS) {
      items.push({
        pin: pin.name,
        severity: "warning",
        code: "pin-large",
        message: `pin has ${pin.chars} chars; split or summarize it to keep the stable prefix lean`,
      });
    }
    if (hasSecret(pin.content)) {
      items.push({
        pin: pin.name,
        severity: "error",
        code: "pin-secret",
        message: "pin appears to contain an unredacted secret; remove or recreate it from a redacted source",
      });
    }
    const hash = contentHash(pin.content);
    byHash.set(hash, [...(byHash.get(hash) ?? []), pin]);
  }

  for (const duplicates of byHash.values()) {
    if (duplicates.length <= 1) continue;
    const names = duplicates.map((pin) => pin.name).join(",");
    for (const pin of duplicates) {
      items.push({
        pin: pin.name,
        severity: "warning",
        code: "pin-duplicate",
        message: `duplicate content with ${names}; keep one copy to avoid wasting prefix budget`,
      });
    }
  }

  if (totalChars > LARGE_TOTAL_CHARS) {
    items.push({
      pin: "*",
      severity: "warning",
      code: "pin-total-large",
      message: `all cache pins total ${totalChars} chars; this may crowd out dynamic context`,
    });
  }

  const severity = reportSeverity(items);
  return {
    pinCount: pins.length,
    totalChars,
    severity,
    items,
    recommendation: recommendationFor(severity, items.length),
  };
}

export function formatCachePinAudit(report: CachePinAuditReport): string {
  const header = `cache pin audit: ${report.severity} pins=${report.pinCount} chars=${report.totalChars}`;
  if (report.items.length === 0) return [header, report.recommendation].join("\n");
  return [
    header,
    ...report.items.map((item) => `${item.severity} ${item.pin} ${item.code}: ${item.message}`),
    report.recommendation,
  ].join("\n");
}

function hasSecret(content: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(content));
}

function contentHash(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim().toLowerCase();
  return createHash("sha256").update(normalized).digest("hex");
}

function reportSeverity(items: CachePinAuditItem[]): CachePinAuditSeverity {
  if (items.some((item) => item.severity === "error")) return "error";
  if (items.some((item) => item.severity === "warning")) return "warning";
  return "ok";
}

function recommendationFor(severity: CachePinAuditSeverity, issueCount: number): string {
  if (severity === "ok") return "Cache pins look healthy for a stable DeepSeek prefix.";
  if (severity === "error") return "Fix error pins before relying on cache reuse; secrets should never enter a stable prefix.";
  return `Review ${issueCount} cache pin warning${issueCount === 1 ? "" : "s"} before large DeepSeek runs.`;
}
