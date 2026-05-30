export function normalizePromptPaste(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function pastedLineCount(text: string): number {
  if (!text) return 0;
  return normalizePromptPaste(text).split("\n").length;
}
