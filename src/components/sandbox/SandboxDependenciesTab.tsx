export function sandboxDependencyRows(dependencies: readonly string[]): string[] {
  return dependencies.length ? [...dependencies] : ["no sandbox dependencies"];
}
