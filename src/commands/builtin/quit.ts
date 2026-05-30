import type { Command } from "../../types/command.js";

export const quitCommand: Command = {
  name: "quit",
  aliases: ["exit"],
  description: "Exit DeepSeekCode.",
  execute() {
    return { exit: true, message: "bye" };
  },
};
