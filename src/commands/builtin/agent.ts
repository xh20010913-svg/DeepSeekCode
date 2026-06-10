import type { Command } from "../../types/command.js";

export const agentCommand: Command = {
  name: "agent",
  description: "Diagnose the unified agent runtime.",
  usage: "doctor",
  execute(args, context) {
    const trimmed = args.trim();
    if (trimmed !== "doctor") return { message: "Usage: /agent doctor" };
    const runs = context.state.listRuns(5);
    const active = context.state.listUnfinishedRuns(context.config.projectPath, 10);
    const events = context.state.listEvents(undefined, 250);
    const workflowEvents = events.filter((event) => event.kind.startsWith("agent_workflow_"));
    const budgetEvents = events.filter((event) => event.kind === "agent_kernel_budget_plan");
    const evidenceEvents = events.filter((event) => event.kind === "agent_kernel_evidence");
    const qualityFailures = workflowEvents.filter((event) => {
      const payload = event.payload as Record<string, unknown> | undefined;
      const planQuality = payload?.plan_quality as Record<string, unknown> | undefined;
      return planQuality && planQuality.passed === false;
    });
    const processes = context.state.listProjectProcesses({
      projectPath: context.config.projectPath,
      includeStale: true,
      limit: 20,
    });
    const runningProcesses = processes.filter((process) => process.status === "running");
    return {
      message: [
        "Agent runtime doctor",
        `project: ${context.config.projectPath}`,
        `recent_runs: ${runs.length} active_runs: ${active.length}`,
        `workflow_events: ${workflowEvents.length} quality_gate_failures: ${qualityFailures.length}`,
        `budget_events: ${budgetEvents.length} evidence_events: ${evidenceEvents.length}`,
        `project_processes: ${processes.length} running=${runningProcesses.length}`,
        "",
        "运行建议:",
        "- 继续/修复/再完善应复用当前 run；只有 /agents dashboard open 才主动开新页面。",
        "- 复杂任务如果只有泛名角色或少于 3 个执行角色，Planner 质量门会要求重写计划。",
        "- 最终完成必须有 evidence；缺文件、截图、PDF、命令或交互证据时应进入修复。",
        "- 停止服务请用 /project stop latest|all，不要退出 TUI。",
      ].join("\n"),
    };
  },
};
