import React from "react";
import type { Command } from "../../types/command.js";
import { HelpPanel } from "../../components/HelpPanel.js";
import { formatCommandHelp } from "../format.js";

export function createHelpCommand(getCommands: () => Command[]): Command {
  return {
    name: "help",
    aliases: ["?"],
    description: "Show DeepSeekCode commands.",
    execute() {
      const commands = getCommands();
      return {
        message: `DeepSeekCode help\n${formatCommandHelp(commands)}`,
        display: React.createElement(HelpPanel, { commands }),
      };
    },
  };
}
