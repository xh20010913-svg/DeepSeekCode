export type LogLevel = "debug" | "info" | "warning" | "error";

export interface LogRecord {
  level: LogLevel;
  message: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}
