import React from "react";
import { ProjectPanel, initPanelModel } from "../../components/ProjectPanel.js";
import type { Command } from "../../types/command.js";
import { formatInitResult, initializeDeepSeekCodeProject } from "../../services/init/projectInit.js";

export const initCommand: Command = {
  name: "init",
  description: "Initialize DeepSeekCode project guidance, memory, commands, skills, plugins, and export folders.",
  usage: "[--force]",
  execute(args, context) {
    const force = args.split(/\s+/).includes("--force");
    const result = initializeDeepSeekCodeProject(context.config, force);
    return {
      message: formatInitResult(result),
      display: React.createElement(ProjectPanel, { model: initPanelModel(result, force) }),
    };
  },
};
