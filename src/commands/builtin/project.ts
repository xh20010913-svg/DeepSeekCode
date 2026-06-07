import React from "react";
import { ProjectPanel, projectPanelModel } from "../../components/ProjectPanel.js";
import type { Command } from "../../types/command.js";
import { stopBackgroundCommand } from "../../tools/shell.js";

export const projectCommand: Command = {
  name: "project",
  description: "Show the active project path and manage launched project processes.",
  usage: "[processes|stop latest|stop <pid>|stop all]",
  execute(args, context) {
    const trimmed = args.trim();
    if (trimmed === "processes") {
      const records = context.state.listProjectProcesses({ projectPath: context.config.projectPath, includeStale: true });
      return {
        message: records.length
          ? records.map((record) => [
            `${record.status} pid=${record.pid}`,
            record.url ? `url=${record.url}` : "",
            record.port ? `port=${record.port}` : "",
            `cwd=${record.cwd}`,
            `command=${record.command}`,
          ].filter(Boolean).join(" | ")).join("\n")
          : "没有记录到由 launch_project 启动的项目进程。",
      };
    }
    if (trimmed === "stop" || trimmed.startsWith("stop ")) {
      const target = trimmed.startsWith("stop ") ? trimmed.slice("stop ".length).trim() : "latest";
      const records = context.state.listProjectProcesses({ projectPath: context.config.projectPath, includeStale: false, limit: 100 });
      const selected = target === "all"
        ? records
        : [target === "latest" ? records[0] : records.find((record) => record.id === target || String(record.pid) === target)].filter((record): record is NonNullable<typeof record> => Boolean(record));
      if (!selected.length) return { message: `没有找到可停止的项目进程：${target}` };
      const lines: string[] = [];
      for (const record of selected) {
        const stopped = stopBackgroundCommand(record.pid);
        context.state.updateProjectProcess({ id: record.id, status: "stopped", stoppedAtMs: Date.now() });
        lines.push(`pid=${record.pid} stopped=${stopped} command=${record.command}`);
      }
      return { message: lines.join("\n") };
    }
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
