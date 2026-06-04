import type { RemoteMessage } from "./types.js";

export interface RemoteAccessConfig {
  allowedUsers: string[];
  allowedGroups: string[];
  botMentionNames: string[];
}

export interface RemoteAccessDecision {
  allowed: boolean;
  reason?: string;
}

export class RemoteAccessPolicy {
  constructor(private readonly config: RemoteAccessConfig) {}

  canReceive(message: RemoteMessage): RemoteAccessDecision {
    if (this.config.allowedUsers.length > 0 && !this.config.allowedUsers.includes(message.userId)) {
      return { allowed: false, reason: "user_not_allowed" };
    }
    if (message.isGroup && this.config.allowedGroups.length > 0 && !this.config.allowedGroups.includes(message.chatId)) {
      return { allowed: false, reason: "group_not_allowed" };
    }
    if (message.isGroup && !this.isGroupCommandAddressed(message.text)) {
      return { allowed: false, reason: "group_message_not_addressed" };
    }
    return { allowed: true };
  }

  private isGroupCommandAddressed(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed.startsWith("/")) return true;
    return this.config.botMentionNames.some((name) => {
      const mention = name.trim();
      return mention && (trimmed.startsWith(`@${mention}`) || trimmed.includes(`@${mention}`));
    });
  }
}

export function parseRemoteCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
