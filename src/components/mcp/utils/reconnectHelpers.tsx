export function reconnectDelayMs(attempt: number): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  return Math.min(30_000, 500 * 2 ** safeAttempt);
}

export function reconnectDelayLabel(attempt: number): string {
  const ms = reconnectDelayMs(attempt);
  return ms < 1000 ? `${ms}ms` : `${Math.round(ms / 1000)}s`;
}
