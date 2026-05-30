import React from "react";
import type { Command } from "../../types/command.js";
import { ProjectPanel, branchPanelModel } from "../../components/ProjectPanel.js";
import { formatGitStatus, summarizeGitStatus } from "../../services/status/projectStatus.js";
import { getGitBranch } from "../../utils/diff.js";

export const branchCommand: Command = {
  name: "branch",
  description: "Show the current git branch and workspace status.",
  execute(_args, context) {
    const branch = getGitBranch(context.config.projectPath);
    const git = summarizeGitStatus(context.config.projectPath);
    const display = React.createElement(ProjectPanel, {
      model: branchPanelModel({
        branchOk: branch.ok,
        branch: branch.diff,
        gitStatus: formatGitStatus(git),
        error: branch.error,
      }),
    });
    if (!branch.ok) return { message: `git branch unavailable: ${branch.error}`, display };
    return {
      message: [
        `branch: ${branch.diff || "(detached HEAD or unnamed)"}`,
        `status: ${formatGitStatus(git)}`,
      ].join("\n"),
      display,
    };
  },
};
