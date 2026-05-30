import type { TerminalTone } from "../design/terminalTheme.js";

export type TaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | string;

export function taskStatusTone(status: TaskStatus): TerminalTone {
  if (status === "completed") return "success";
  if (status === "failed" || status === "cancelled") return "error";
  if (status === "running") return "warning";
  if (status === "queued") return "brand";
  return "muted";
}

export function taskStatusLabel(status: TaskStatus): string {
  return status || "unknown";
}
