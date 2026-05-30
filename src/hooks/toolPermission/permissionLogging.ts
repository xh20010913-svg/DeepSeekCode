export interface PermissionLogEntry {
  tool: string;
  decision: "allow" | "deny" | "ask";
  reason?: string;
}

export function formatPermissionLog(entry: PermissionLogEntry): string {
  return [entry.decision, entry.tool, entry.reason].filter(Boolean).join(" ");
}
