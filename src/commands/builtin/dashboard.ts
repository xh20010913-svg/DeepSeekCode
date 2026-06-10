import type { Command } from "../../types/command.js";
import { closeAgentDashboardServer } from "../../services/agents/agentDashboardServer.js";

export const dashboardCommand: Command = {
  name: "dashboard",
  description: "Reset the Pixel Agent dashboard server.",
  usage: "reset",
  async execute(args) {
    const trimmed = args.trim();
    if (trimmed !== "reset") return { message: "Usage: /dashboard reset" };
    await closeAgentDashboardServer();
    return {
      message: "已关闭当前 Pixel Agent 面板服务。下次使用 /agents dashboard open 或 /agents dashboard tunnel 会重新启动，并继续读取同一个 run snapshot。",
    };
  },
};
