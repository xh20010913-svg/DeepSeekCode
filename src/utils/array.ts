export function last<T>(values: readonly T[]): T | undefined {
  return values[values.length - 1];
}

export function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const value of values) {
    const id = key(value);
    if (seen.has(id)) continue;
    seen.add(id);
    output.push(value);
  }
  return output;
}
