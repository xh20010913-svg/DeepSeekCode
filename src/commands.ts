export {
  getCommands,
  runSlashCommand,
} from "./commands/index.js";

export type {
  Command,
  CommandContext,
  CommandResult,
} from "./types/command.js";

export {
  commandMatches,
  getCommandName,
} from "./types/command.js";
