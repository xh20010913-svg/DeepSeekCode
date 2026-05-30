export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
  level: LogLevel;
  message: string;
  metadata?: unknown;
  createdAtMs: number;
}

const inMemoryLogs: LogRecord[] = [];

export function log(level: LogLevel, message: string, metadata?: unknown): void {
  inMemoryLogs.push({ level, message, metadata, createdAtMs: Date.now() });
  if (inMemoryLogs.length > 500) inMemoryLogs.shift();
}

export function logError(message: string, metadata?: unknown): void {
  log("error", message, metadata);
}

export function getInMemoryLogs(): LogRecord[] {
  return [...inMemoryLogs];
}
