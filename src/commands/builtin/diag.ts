import React from "react";
import type { Command } from "../../types/command.js";
import { DiagnosticsDisplay, diagnosticsDisplayModel } from "../../components/DiagnosticsDisplay.js";

export const diagCommand: Command = {
  name: "diag",
  description: "Show a compact diagnostic snapshot.",
  execute(_args, context) {
    const runs = context.state.listRuns(5);
    const latest = runs[0];
    return {
      message: JSON.stringify({
        model: context.config.model,
        providerReady: Boolean(context.provider),
        permissionProfile: context.permissions.profile,
        shell: context.permissions.allowShell,
        browser: context.permissions.allowBrowser,
        recentRuns: runs.length,
        latestRun: latest
          ? {
              id: latest.id,
              status: latest.status,
              actions: latest.actionCount,
              artifacts: latest.artifactCount,
              events: latest.eventCount,
            }
          : null,
      }, null, 2),
      display: React.createElement(DiagnosticsDisplay, {
        model: diagnosticsDisplayModel({
          config: context.config,
          providerReady: Boolean(context.provider),
          providerName: context.config.provider?.name,
          permissions: context.permissions,
          runs,
        }),
      }),
    };
  },
};
