export function shellPermissionLabel(enabled: boolean): string {
  return enabled ? "shell allowed" : "shell approval required";
}

export function shellCommandRisk(command: string): "low" | "medium" | "high" {
  if (/\b(rm|del|format|shutdown|reg)\b/i.test(command)) return "high";
  if (/\b(npm|pnpm|yarn|git|powershell|cmd)\b/i.test(command)) return "medium";
  return "low";
}
