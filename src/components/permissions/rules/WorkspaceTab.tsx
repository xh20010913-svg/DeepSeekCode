export function workspaceTabLabel(count: number): string {
  return `${Math.max(0, count)} workspace director${count === 1 ? "y" : "ies"}`;
}
