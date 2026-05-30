export function isSlashCommand(input: string): boolean {
  return input.trimStart().startsWith("/");
}

export function normalizePromptInput(input: string): string {
  return input.replace(/\r\n/g, "\n").trim();
}
