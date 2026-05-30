export interface ClaudeCodeInternalEvent {
  eventName: string;
  createdAt?: string;
  metadata?: Record<string, string | number | boolean>;
}
