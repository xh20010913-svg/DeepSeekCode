export function useShowFastIconHint(model: string | undefined): boolean {
  return /flash|fast|lite/i.test(model ?? "");
}
