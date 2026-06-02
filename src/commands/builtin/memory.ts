import React from "react";
import type { Command } from "../../types/command.js";
import { appendProjectMemory, memoryFilePath, readProjectMemory } from "../../memdir/projectMemory.js";
import { ProjectMemoryPanel, projectMemoryPanelModel } from "../../components/ProjectMemoryPanel.js";
import { getTencentMemoryService } from "../../services/memory/tencentMemoryService.js";

export const memoryCommand: Command = {
  name: "memory",
  description: "View project memory and TencentDB-Agent-Memory status/search.",
  usage: "[add <text>|path|status|search <query>|conversation <query>]",
  async execute(args, context) {
    const trimmed = args.trim();
    const path = memoryFilePath(context.config.projectPath);
    const tdai = getTencentMemoryService(context.config, context.provider, context.state);
    if (trimmed === "status") {
      await tdai.initialize();
      return { message: JSON.stringify(tdai.status, null, 2) };
    }
    if (trimmed.startsWith("search ")) {
      const query = trimmed.slice("search ".length).trim();
      if (!query) return { message: "Usage: /memory search <query>" };
      const result = await tdai.searchMemory({ query, limit: 8 });
      return { message: result.text || "No memory results." };
    }
    if (trimmed.startsWith("conversation ")) {
      const query = trimmed.slice("conversation ".length).trim();
      if (!query) return { message: "Usage: /memory conversation <query>" };
      const result = await tdai.searchConversations({ query, limit: 8 });
      return { message: result.text || "No conversation results." };
    }
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
