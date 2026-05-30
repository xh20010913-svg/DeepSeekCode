export function sandboxConfigRows(enabled: boolean): string[] {
  return [enabled ? "sandbox enabled" : "sandbox disabled"];
}
