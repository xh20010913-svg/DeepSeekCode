import type { Command } from "../../types/command.js";
import { runProviderMultiAgent } from "../../coordinator/commander.js";

export const multiCommand: Command = {
  name: "multi",
  description: "Run the Planner/Builder/Tester/Reviewer multi-agent flow.",
  usage: "provider <task>",
  async execute(args, context) {
    const trimmed = args.trim();
    if (!trimmed.startsWith("provider ")) {
      return { message: "Usage: /multi provider <task>" };
    }
    if (!context.provider) {
      return { message: "DEEPSEEK_API_KEY is not configured, so provider multi-agent mode cannot run." };
    }
    const task = trimmed.slice("provider ".length).trim();
    const result = await runProviderMultiAgent({
      goal: task,
      config: context.config,
      state: context.state,
      provider: context.provider,
      permissions: context.permissions,
      onUsage: (usage) => context.recordUsageEvent?.(usage),
      onRunCreated: async (runId) => {
        await context.openAgentDashboard?.(runId, {
          openBrowser: true,
          share: false,
          writeTrace: true,
        });
      },
    });
    return { message: result };
  },
};
