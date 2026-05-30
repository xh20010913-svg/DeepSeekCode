import type { Command } from "../../types/command.js";
import {
  formatWorkspaceAddResult,
  WorkspaceDirectoryService,
} from "../../services/workspace/workspaceDirectoryService.js";

export const addDirCommand: Command = {
  name: "add-dir",
  aliases: ["adddir"],
  description: "Add extra working directories to prompt context selection.",
  usage: "<path>|list|remove <index|path>|clear|path",
  execute(args, context) {
    const service = new WorkspaceDirectoryService(context.config.projectPath);
    const trimmed = args.trim();
    if (!trimmed || trimmed === "list") {
      const directories = service.list();
      return {
        message: directories.length
          ? directories.map((entry, index) => `${index + 1}. ${entry.name} ${entry.path}`).join("\n")
          : "No extra working directories. Use /add-dir <path> to include one in prompt context.",
      };
    }
    if (trimmed === "path") return { message: service.configPath() };
    if (trimmed === "clear") {
      const count = service.clear();
      return { message: `cleared ${count} extra working director${count === 1 ? "y" : "ies"}` };
    }
    if (trimmed.startsWith("remove ")) {
      const removed = service.remove(trimmed.slice("remove ".length));
      return {
        message: removed
          ? `removed working directory ${removed.name}: ${removed.path}`
          : "Working directory not found.",
      };
    }
    return { message: formatWorkspaceAddResult(service.add(trimmed)) };
  },
};
