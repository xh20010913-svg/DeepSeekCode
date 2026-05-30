import type { Command, CommandContext, CommandResult } from "../types/command.js";
import { commandMatches } from "../types/command.js";
import { buildCommandCatalog } from "./catalog.js";

const COMMAND_ALIASES: Record<string, string> = {
  "add-dir": "add-dir",
  "agents-platform": "agents",
  "ant-trace": "trace",
  "autofix-pr": "review",
  "backfill-sessions": "sessions",
  "break-cache": "cache",
  "bughunter": "review",
  "chrome": "browser",
  "color": "theme",
  "ctx_viz": "context",
  "debug-tool-call": "trace",
  "desktop": "status",
  "env": "config",
  "exit": "quit",
  "extra-usage": "usage",
  "fix": "review",
  "help-v2": "help",
  "keybindings": "settings",
  "memory": "memory",
  "migrate-installer": "doctor",
  "migrate": "doctor",
  "model": "model",
  "mcp": "mcp",
  "permissions": "permissions",
  "plugin": "plugins",
  "plugins": "plugins",
  "pr": "review",
  "release-notes": "version",
  "review": "review",
  "security-review": "security-review",
  "statusline": "status",
  "sync": "status",
  "terminal-setup": "doctor",
  "theme": "theme",
  "ultraplan": "plan",
};

export interface CommandAdapterInfo {
  referenceName: string;
  targetName: string;
  implemented: boolean;
}

export function createCommandAdapter(referenceName: string, targetName = commandTargetName(referenceName)): Command {
  return {
    name: normalizeCommandName(referenceName),
    description: `ClaudeCode path-compatible adapter for DeepSeekCode /${targetName}.`,
    usage: "[args]",
    async execute(args: string, context: CommandContext): Promise<CommandResult> {
      const target = findLocalCommand(targetName, context);
      if (target) return target.execute(args, context);
      return {
        message: [
          `/${normalizeCommandName(referenceName)} is available as a ClaudeCode-compatible source path.`,
          `DeepSeekCode has not implemented the /${targetName} command yet.`,
          "Run /help to see supported local commands, or use /plugins and /skills for extension workflows.",
        ].join("\n"),
      };
    },
  };
}

export function commandAdapterInfo(referenceName: string, context?: CommandContext): CommandAdapterInfo {
  const targetName = commandTargetName(referenceName);
  return {
    referenceName: normalizeCommandName(referenceName),
    targetName,
    implemented: context ? Boolean(findLocalCommand(targetName, context)) : Boolean(COMMAND_ALIASES[normalizeCommandName(referenceName)]),
  };
}

export function commandTargetName(referenceName: string): string {
  const normalized = normalizeCommandName(referenceName);
  return COMMAND_ALIASES[normalized] ?? normalized;
}

export function normalizeCommandName(value: string): string {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)[0]
    ?.replace(/\.(tsx?|jsx?)$/, "")
    .toLowerCase() ?? value.toLowerCase();
}

function findLocalCommand(name: string, context: CommandContext): Command | undefined {
  return buildCommandCatalog(context).find((command) => commandMatches(command, name));
}
