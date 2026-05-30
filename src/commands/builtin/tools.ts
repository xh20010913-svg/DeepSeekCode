import React from "react";
import type { Command } from "../../types/command.js";
import { OperationPanel, toolDetailPanelModel, toolsPanelModel } from "../../components/OperationPanel.js";
import { baseTools } from "../../tools/registry.js";

export const toolsCommand: Command = {
  name: "tools",
  description: "List local tools and permission-sensitive capabilities.",
  usage: "[show <tool-name>]",
  execute(args, context) {
    const trimmed = args.trim();
    const toolContext = {
      root: context.config.projectPath,
      allowShell: context.permissions.allowShell,
      allowBrowser: context.permissions.allowBrowser,
    };
    if (trimmed.startsWith("show ")) {
      const name = trimmed.slice("show ".length).trim();
      const tool = baseTools.find((candidate) => candidate.name === name);
      if (!tool) return { message: `Tool not found: ${name}` };
      const display = React.createElement(OperationPanel, { model: toolDetailPanelModel(tool, toolContext) });
      return {
        message: [
          `${tool.name} (${tool.displayName})`,
          tool.description,
          `enabled=${tool.isEnabled(toolContext)}`,
          `permission=${tool.checkPermissions({ type: tool.name }, toolContext).behavior}`,
        ].join("\n"),
        display,
      };
    }
    const display = React.createElement(OperationPanel, { model: toolsPanelModel(baseTools, toolContext) });
    return {
      message: baseTools
        .map((tool) => {
          const permission = tool.checkPermissions({ type: tool.name }, toolContext);
          return `${tool.name} enabled=${tool.isEnabled(toolContext)} permission=${permission.behavior} - ${tool.description}`;
        })
        .join("\n"),
      display,
    };
  },
};
