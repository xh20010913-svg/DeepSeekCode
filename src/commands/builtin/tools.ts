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
          `capability=${capabilityStatus(tool.name)}`,
          tool.description,
          `enabled=${tool.isEnabled(toolContext)}`,
          `permission=${safePermission(tool, toolContext)}`,
        ].join("\n"),
        display,
      };
    }
    const display = React.createElement(OperationPanel, { model: toolsPanelModel(baseTools, toolContext) });
    return {
      message: baseTools
        .map((tool) => {
          return `${tool.name} status=${capabilityStatus(tool.name)} enabled=${tool.isEnabled(toolContext)} permission=${safePermission(tool, toolContext)} - ${tool.description}`;
        })
        .join("\n"),
      display,
    };
  },
};

function capabilityStatus(name: string): "supported" | "partial" | "experimental" | "reserved" {
  if (name === "computer_use") return "reserved";
  if (name.startsWith("browser_") || name === "mcp_call" || name === "invoke_agent") return "partial";
  return "supported";
}

function safePermission(tool: (typeof baseTools)[number], context: {
  root: string;
  allowShell: boolean;
  allowBrowser: boolean;
}): string {
  try {
    return tool.checkPermissions({ type: tool.name }, context).behavior;
  } catch {
    return "input-dependent";
  }
}
