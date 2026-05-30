export function useDebouncedDigitInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 1);
}
