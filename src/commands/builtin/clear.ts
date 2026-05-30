import type { Command } from "../../types/command.js";

export const clearCommand: Command = {
  name: "clear",
  description: "Clear the current TUI transcript.",
  execute() {
    return { clear: true, message: "Transcript cleared." };
  },
};
