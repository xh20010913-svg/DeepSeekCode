export function recentDenialsLabel(count: number): string {
  return `${Math.max(0, count)} recent denial${count === 1 ? "" : "s"}`;
}
