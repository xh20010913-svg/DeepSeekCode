import React from "react";
import { ProjectPanel, projectPanelModel } from "../../components/ProjectPanel.js";
import type { Command } from "../../types/command.js";

export const projectCommand: Command = {
  name: "project",
  description: "Show the active project path.",
  execute(_args, context) {
    return {
      message: context.config.projectPath,
      display: React.createElement(ProjectPanel, {
        model: projectPanelModel({
          projectPath: context.config.projectPath,
          dataDir: context.config.dataDir,
          stateDbPath: context.config.stateDbPath,
          model: context.config.model,
          permissionProfile: context.permissions.profile ?? "custom",
        }),
      }),
    };
  },
};
