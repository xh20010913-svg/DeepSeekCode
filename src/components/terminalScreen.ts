let activeDepth = 0;
let restoreInstalled = false;
let restoredAfterFatal = false;

const ENTER_ALTERNATE_SCREEN = "\x1b[?1049h\x1b[H\x1b[?25h";
const RESTORE_TERMINAL = [
  "\x1b[0m",
  "\x1b[?25h",
  "\x1b[?1000l",
  "\x1b[?1002l",
  "\x1b[?1003l",
  "\x1b[?1006l",
  "\x1b[?1015l",
  "\x1b[?2004l",
  "\x1b[?1049l",
].join("");

export function enterTerminalScreen(): () => void {
  if (!shouldUseAlternateScreen()) return () => {};
  installTerminalRestoreHooks();
  if (activeDepth === 0) {
    process.stdout.write(ENTER_ALTERNATE_SCREEN);
  }
  activeDepth += 1;
  return restoreTerminalScreen;
}

export function restoreTerminalScreen(): void {
  if (activeDepth > 0) activeDepth -= 1;
  if (activeDepth > 0) return;
  resetTerminalModes();
}

export function resetTerminalModes(): void {
  if (!process.stdout.isTTY) return;
  try {
    process.stdout.write(RESTORE_TERMINAL);
  } catch {
    // Best-effort terminal cleanup.
  }
  const stdin = process.stdin as typeof process.stdin & { setRawMode?: (mode: boolean) => void };
  try {
    if (stdin.isTTY && typeof stdin.setRawMode === "function") stdin.setRawMode(false);
  } catch {
    // Ignore terminals that do not expose raw mode.
  }
}

function shouldUseAlternateScreen(): boolean {
  if (process.env.DEEPSEEKCODE_ALT_SCREEN === "0") return false;
  return Boolean(process.stdout.isTTY);
}

function installTerminalRestoreHooks(): void {
  if (restoreInstalled) return;
  restoreInstalled = true;
  process.on("exit", () => resetTerminalModes());
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.once(signal, () => {
      resetTerminalModes();
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  }
  process.once("uncaughtException", (error) => {
    fatalRestore();
    throw error;
  });
  process.once("unhandledRejection", (reason) => {
    fatalRestore();
    throw reason instanceof Error ? reason : new Error(String(reason));
  });
}

function fatalRestore(): void {
  if (restoredAfterFatal) return;
  restoredAfterFatal = true;
  activeDepth = 0;
  resetTerminalModes();
}
