export function sandboxOverrideRows(overrides: readonly string[]): string[] {
  return overrides.length ? [...overrides] : ["no overrides"];
}
