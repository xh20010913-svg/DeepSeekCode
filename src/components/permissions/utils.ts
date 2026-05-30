import type { TerminalTone } from "../design/terminalTheme.js";

export type PermissionRisk = "low" | "medium" | "high";

export function permissionRiskTone(risk: PermissionRisk): TerminalTone {
  if (risk === "high") return "error";
  if (risk === "medium") return "warning";
  return "success";
}

export function permissionSummary(action: string, target?: string): string {
  return [action.trim() || "permission", target?.trim()].filter(Boolean).join(" | ");
}
