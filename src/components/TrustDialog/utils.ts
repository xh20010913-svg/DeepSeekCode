export function trustModeLabel(trusted: boolean): string {
  return trusted ? "trusted workspace" : "review workspace trust";
}
