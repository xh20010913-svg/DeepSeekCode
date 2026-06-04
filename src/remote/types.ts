import type { QueryEvent } from "../query/QueryEngine.js";

export type RemoteChannelName = "wecom";

export interface RemoteAttachment {
  kind: "file" | "image" | "voice" | "video";
  filename: string;
  path: string;
  bytes: number;
}

export interface RemoteMessage {
  channel: RemoteChannelName;
  messageId: string;
  chatId: string;
  userId: string;
  isGroup: boolean;
  text: string;
  attachments?: RemoteAttachment[];
  receivedAtMs: number;
  raw?: unknown;
}

export interface RemoteDecision {
  key: string;
  taskId?: string;
  chatId: string;
  userId: string;
  raw?: unknown;
}

export interface RemoteReplySink {
  sendProgress(text: string): Promise<void>;
  sendFinal(text: string): Promise<void>;
  sendApproval(input: RemoteApprovalPrompt): Promise<void>;
  sendFile?(path: string, kind?: "file" | "image"): Promise<void>;
}

export interface RemoteApprovalPrompt {
  gateId: string;
  runId: string;
  summary: string;
  projectPath: string;
}

export interface RemoteChannel {
  readonly name: RemoteChannelName;
  start(): Promise<void> | void;
  stop(): Promise<void> | void;
  status(): string;
}

export interface RemoteRunEvent {
  message: RemoteMessage;
  event: QueryEvent;
}
