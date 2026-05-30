export function useMultipleChoiceState(options: readonly string[], selected: readonly string[] = []): string[] {
  const allowed = new Set(options);
  return selected.filter((item) => allowed.has(item));
}
