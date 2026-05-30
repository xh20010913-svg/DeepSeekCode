import { buildCommandCatalog } from "./catalog.js";
import type { Command, CommandContext, CommandResult } from "../types/command.js";
import { commandMatches } from "../types/command.js";

export function getCommands(context?: CommandContext): Command[] {
  return buildCommandCatalog(context);
}

export async function runSlashCommand(
  input: string,
  context: CommandContext,
): Promise<CommandResult> {
  const trimmed = input.trim();
  const [nameWithSlash = ""] = trimmed.split(/\s+/);
  const name = nameWithSlash.replace(/^\//, "");
  const args = trimmed.slice(nameWithSlash.length).trim();
  const command = getCommands(context).find((candidate) => commandMatches(candidate, name));
  if (!command) {
    return {
      message: `Unknown command /${name}. Run /help to see available commands.`,
    };
  }
  return command.execute(args, context);
}
