export function teammateSelectHint(count: number): string {
  return count > 0 ? `${count} agents selectable` : "no agents selectable";
}
