import type { ReactNode } from "react";
import type { RuntimeConfig } from "../bootstrap/config.js";
import type { DeepSeekProviderClient, UsageSnapshot } from "../protocol/provider.js";
import type { RuntimePermissionState } from "../services/permissions/permissionProfiles.js";
import type { StateStore } from "../state/sqlite.js";

export interface CommandContext {
  config: RuntimeConfig;
  state: StateStore;
  provider: DeepSeekProviderClient | null;
  permissions: RuntimePermissionState;
  requestExit?: () => void;
  requestClear?: () => void;
  requestModelSelector?: () => void;
  switchModel?: (model: string) => boolean;
  switchLanguage?: (language: string) => boolean;
  recordUsageEvent?: (usage: UsageSnapshot) => void;
  emitSystemMessage?: (message: string) => void;
  emitRemoteUserMessage?: (message: string) => void;
  emitRemoteAssistantMessage?: (message: string) => void;
}

export interface CommandResult {
  message?: string;
  display?: ReactNode;
  submit?: string;
  exit?: boolean;
  clear?: boolean;
}

export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;
  hidden?: boolean;
  execute(args: string, context: CommandContext): Promise<CommandResult> | CommandResult;
}

export function getCommandName(command: Command): string {
  return `/${command.name}`;
}

export function commandMatches(command: Command, name: string): boolean {
  return command.name === name || Boolean(command.aliases?.includes(name));
}
