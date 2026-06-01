export class DeepSeekCodeAbortError extends Error {
  constructor(reason?: unknown) {
    super(abortReasonText(reason));
    this.name = "AbortError";
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new DeepSeekCodeAbortError(signal.reason);
}

export function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) || error instanceof DeepSeekCodeAbortError;
}

export function abortReasonText(reason?: unknown): string {
  if (reason instanceof Error) return reason.message || "aborted";
  if (typeof reason === "string" && reason.trim()) return reason;
  return "aborted";
}
