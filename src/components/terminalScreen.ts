let active = false;

export function enterTerminalScreen(): () => void {
  if (!shouldUseAlternateScreen()) return () => {};
  if (!active) {
    process.stdout.write("\x1b[?1049h\x1b[H");
    active = true;
  }
  return restoreTerminalScreen;
}

export function restoreTerminalScreen(): void {
  if (!active) return;
  active = false;
  process.stdout.write("\x1b[?1049l");
}

function shouldUseAlternateScreen(): boolean {
  if (process.env.DEEPSEEKCODE_ALT_SCREEN === "0") return false;
  return Boolean(process.stdout.isTTY);
}
