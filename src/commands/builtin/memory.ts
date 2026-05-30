import React from "react";
import type { Command } from "../../types/command.js";
import { appendProjectMemory, memoryFilePath, readProjectMemory } from "../../memdir/projectMemory.js";
import { ProjectMemoryPanel, projectMemoryPanelModel } from "../../components/ProjectMemoryPanel.js";

export const memoryCommand: Command = {
  name: "memory",
  description: "View or append project memory.",
  usage: "[add <text>|path]",
  execute(args, context) {
    const trimmed = args.trim();
    const path = memoryFilePath(context.config.projectPath);
    if (trimmed === "path") {
      return {
        message: path,
        display: React.createElement(ProjectMemoryPanel, {
          model: projectMemoryPanelModel(readProjectMemory(context.config.projectPath), path),
        }),
      };
    }
    if (trimmed.startsWith("add ")) {
      const text = trimmed.slice("add ".length).trim();
      if (!text) return { message: "Usage: /memory add <text>" };
      appendProjectMemory(context.config.projectPath, text);
      return {
        message: "Project memory appended.",
        display: React.createElement(ProjectMemoryPanel, {
          model: projectMemoryPanelModel(readProjectMemory(context.config.projectPath), path),
          updated: true,
          projectPath: context.config.projectPath,
        }),
      };
    }
    const memory = readProjectMemory(context.config.projectPath).trim();
    return {
      message: memory || "Project memory is empty. Use /memory add <text> to append.",
      display: React.createElement(ProjectMemoryPanel, {
        model: projectMemoryPanelModel(memory, path),
      }),
    };
  },
};
