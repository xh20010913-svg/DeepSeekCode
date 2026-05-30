export function teleportStashLabel(count: number): string {
  return `${Math.max(0, count)} stashed change${count === 1 ? "" : "s"}`;
}
