import React from "react";
import type { Command } from "../../types/command.js";
import { AgentService } from "../../services/agents/agentService.js";
import { AgentDaemonService } from "../../services/agents/agentDaemon.js";
import { AgentRunService } from "../../services/agents/agentRunService.js";
import { buildAgentWizardPlan, formatAgentWizardPlan } from "../../services/agents/agentWizard.js";
import { AgentWorkflowService } from "../../services/agents/agentWorkflow.js";
import { resolveRunId } from "../runSelection.js";
import {
  AgentPanel,
  agentDaemonPanelModel,
  agentDetailPanelModel,
  agentDrainPanelModel,
  agentListPanelModel,
  agentOperationPanelModel,
  agentRunDetailPanelModel,
  agentRunsPanelModel,
  agentStartedPanelModel,
  agentStepPanelModel,
  agentValidationPanelModel,
  agentWizardPanelModel,
} from "../../components/AgentPanel.js";

export const agentsCommand: Command = {
  name: "agents",
  description: "List, show, create, validate, and run DeepSeekCode agents.",
  usage: "[show <name>|create <name> <description>|suggest <goal>|create-smart <name> <goal>|runs|detail [attached|current]|start <name> <task>|add <attached|current> <name> <task>|step [attached|current]|drain [attached|current] [max-steps]|daemon [all|attached|current] [max-runs] [max-steps]|run <name> <task>|validate [name]|path [name]]",
  async execute(args, context) {
    const trimmed = args.trim();
    const service = new AgentService(context.config.projectPath, context.config.dataDir);
    if (trimmed.startsWith("create ")) {
      const [name, ...descriptionParts] = parseArgs(trimmed.slice("create ".length));
      if (!name || descriptionParts.length === 0) return { message: "Usage: /agents create <name> <description>" };
      try {
        const agent = service.createProjectAgent({
          name,
          description: descriptionParts.join(" "),
          tools: ["read_file", "grep_files", "list_files"],
        });
        return {
          message: `created agent ${agent.scope}/${agent.name}: ${agent.path}`,
          display: React.createElement(AgentPanel, { model: agentDetailPanelModel(agent) }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("suggest ")) {
      const goal = trimmed.slice("suggest ".length).trim();
      if (!goal) return { message: "Usage: /agents suggest <goal>" };
      try {
        const plan = buildAgentWizardPlan({ goal });
        return {
          message: formatAgentWizardPlan(plan),
          display: React.createElement(AgentPanel, { model: agentWizardPanelModel(plan) }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("create-smart ")) {
      const [name, ...goalParts] = parseArgs(trimmed.slice("create-smart ".length));
      if (!name || goalParts.length === 0) return { message: "Usage: /agents create-smart <name> <goal>" };
      try {
        const plan = buildAgentWizardPlan({ name, goal: goalParts.join(" ") });
        const agent = service.createProjectAgent({
          name: plan.name,
          description: plan.description,
          body: plan.prompt,
          tools: plan.tools,
          disallowedTools: plan.disallowedTools,
          color: plan.color,
          maxTurns: plan.maxTurns,
        });
        return {
          message: [
            `created smart agent ${agent.scope}/${agent.name}: ${agent.path}`,
            `tools: ${plan.tools.join(", ")}`,
            plan.disallowedTools.length ? `disallowed-tools: ${plan.disallowedTools.join(", ")}` : "",
          ].filter(Boolean).join("\n"),
          display: React.createElement(AgentPanel, { model: agentDetailPanelModel(agent) }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed === "runs") {
      const runs = new AgentRunService(context.state, context.config).list(20);
      if (runs.length === 0) {
        return {
          message: "No agent runs recorded.",
          display: React.createElement(AgentPanel, { model: agentRunsPanelModel(runs) }),
        };
      }
      return {
        message: runs.map(({ run, tasks }, index) => {
          const taskSummary = tasks.length
            ? tasks.map((task) => `${task.status}:${task.agent}`).join(",")
            : "no-tasks";
          return `run ${index + 1} ${run.id} ${run.status} actions=${run.actionCount} tasks=${taskSummary} ${run.message}`;
        }).join("\n"),
        display: React.createElement(AgentPanel, { model: agentRunsPanelModel(runs) }),
      };
    }
    if (trimmed === "workflow" || trimmed.startsWith("workflow ")) {
      const workflowId = trimmed.startsWith("workflow ") ? trimmed.slice("workflow ".length).trim() : undefined;
      try {
        const service = new AgentWorkflowService(context.state, context.config.projectPath);
        const status = service.status(workflowId);
        const taskByAgent = new Map(status.tasks.map((task) => [task.agent, task]));
        const counts = {
          total: status.tasks.length,
          done: status.tasks.filter((task) => task.status === "succeeded").length,
          running: status.tasks.filter((task) => task.status === "running").length,
          failed: status.tasks.filter((task) => task.status === "failed").length,
        };
        const rows = status.record.roles.map((role) => {
          const task = taskByAgent.get(role.name);
          const taskStatus = task?.status ?? "defined";
          return {
            key: role.name,
            name: role.name,
            status: taskStatus,
            tone: taskStatus === "succeeded"
              ? "success" as const
              : taskStatus === "failed"
                ? "error" as const
                : taskStatus === "running"
                  ? "warning" as const
                  : "brand" as const,
            detail: role.responsibility,
            note: [
              role.skills.length ? `skills=${role.skills.join(",")}` : "skills=none",
              role.tools.length ? `tools=${role.tools.join(",")}` : "tools=inherit",
              role.acceptance.length ? `acceptance=${role.acceptance.slice(0, 2).join(" | ")}` : "",
            ].filter(Boolean).join(" "),
          };
        });
        const message = [
          `agent workflow ${status.record.status}`,
          `objective: ${status.record.objective}`,
          `roles: ${status.record.roles.map((role) => role.name).join(", ")}`,
          `tasks: ${counts.done}/${counts.total} done, running=${counts.running}, failed=${counts.failed}`,
          status.record.acceptanceCriteria.length ? `acceptance: ${status.record.acceptanceCriteria.join(" | ")}` : "",
          status.messages.length ? `latest: ${status.messages.at(-1)?.from} -> ${status.messages.at(-1)?.to}: ${status.messages.at(-1)?.message}` : "",
        ].filter(Boolean).join("\n");
        return {
          message,
          display: React.createElement(AgentPanel, {
            model: {
              title: "Agent workflow",
              subtitle: status.record.objective,
              rows,
              preview: [
                `status: ${status.record.status}`,
                ...status.messages.slice(-6).map((item) => `${item.from} -> ${item.to}: ${item.message}`),
              ],
              footer: "/agents workflow | /agents detail attached | /agents runs",
            },
          }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed === "detail" || trimmed.startsWith("detail ")) {
      const runId = resolveAgentRunId(trimmed.startsWith("detail ") ? trimmed.slice("detail ".length) : "", context);
      if (!runId) return { message: "No run records yet." };
      try {
        const detail = new AgentRunService(context.state, context.config).detail(runId);
        return {
          message: [
            `agent run ${detail.run.status} actions=${detail.run.actionCount} artifacts=${detail.run.artifactCount}`,
            detail.run.message,
            "",
            "tasks:",
            ...(detail.tasks.length
              ? detail.tasks.map((task) => `- ${task.status} ${task.agent}: ${task.title}${task.detail ? ` (${task.detail})` : ""}`)
              : ["- none"]),
            "",
            "events:",
            ...(detail.events.length
              ? detail.events.slice(0, 10).map((event) => `- ${event.kind} ${summarizePayload(event.payload)}`)
              : ["- none"]),
          ].join("\n"),
          display: React.createElement(AgentPanel, { model: agentRunDetailPanelModel(detail) }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("run ")) {
      const [name, ...taskParts] = parseArgs(trimmed.slice("run ".length));
      if (!name || taskParts.length === 0) return { message: "Usage: /agents run <name> <task>" };
      if (!context.provider) {
        return { message: "Provider missing; configure DEEPSEEK_API_KEY before running agents." };
      }
      try {
        const result = await new AgentRunService(context.state, context.config).runNow({
          agent: name,
          task: taskParts.join(" "),
          provider: context.provider,
          permissions: context.permissions,
        });
        return {
          message: [
            `agent run completed: ${result.status}`,
            result.message || "(no final message)",
            `turns=${result.result?.turns.length ?? 0}`,
            `actions=${result.result?.envelope.actions.length ?? 0}`,
            ...(result.result?.execution.results ?? []).map((item) => `- ${item.action_type}: ${item.status}${item.message ? ` ${item.message}` : ""}`),
          ].join("\n"),
          display: React.createElement(AgentPanel, { model: agentStepPanelModel(result) }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("start ")) {
      const [name, ...taskParts] = parseArgs(trimmed.slice("start ".length));
      if (!name || taskParts.length === 0) return { message: "Usage: /agents start <name> <task>" };
      try {
        const result = new AgentRunService(context.state, context.config).start({
          agent: name,
          task: taskParts.join(" "),
        });
        return {
          message: [
            "agent run started",
            "task queued",
            "Use /attach latest, then /agents step attached when you want to advance it.",
          ].join("\n"),
          display: React.createElement(AgentPanel, { model: agentStartedPanelModel(result) }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("add ")) {
      const [runSelector, name, ...taskParts] = parseArgs(trimmed.slice("add ".length));
      if (!runSelector || !name || taskParts.length === 0) {
        return { message: "Usage: /agents add <attached|current> <name> <task>" };
      }
      const runId = resolveAgentRunId(runSelector, context);
      if (!runId) return { message: "No run records yet." };
      try {
        new AgentRunService(context.state, context.config).addTask({
          runId,
          agent: name,
          task: taskParts.join(" "),
        });
        return {
          message: "agent task added to the selected run",
          display: React.createElement(AgentPanel, {
            model: agentOperationPanelModel({
              title: "Agent task added",
              subtitle: "selected run",
              name: `${name} task`,
              status: "queued",
              detail: `${name}: ${taskParts.join(" ")}`,
              note: "task recorded",
              footer: "/agents detail attached | /agents step attached",
            }),
          }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed === "step" || trimmed.startsWith("step ")) {
      if (!context.provider) {
        return { message: "Provider missing; configure DEEPSEEK_API_KEY before stepping agent runs." };
      }
      const runId = resolveAgentRunId(trimmed.startsWith("step ") ? trimmed.slice("step ".length) : "", context);
      if (!runId) return { message: "No run records yet." };
      try {
        const result = await new AgentRunService(context.state, context.config).step({
          runId,
          provider: context.provider,
          permissions: context.permissions,
        });
        return {
          message: [
            `agent step: ${result.status}`,
            result.task ? `task=${result.task.agent}` : "",
            result.message,
            `turns=${result.result?.turns.length ?? 0}`,
            `actions=${result.result?.envelope.actions.length ?? 0}`,
          ].filter(Boolean).join("\n"),
          display: React.createElement(AgentPanel, { model: agentStepPanelModel(result) }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed === "drain" || trimmed.startsWith("drain ")) {
      if (!context.provider) {
        return { message: "Provider missing; configure DEEPSEEK_API_KEY before draining agent runs." };
      }
      const parts = parseArgs(trimmed.startsWith("drain ") ? trimmed.slice("drain ".length) : "");
      const runId = resolveAgentRunId(parts[0] ?? "", context);
      if (!runId) return { message: "No run records yet." };
      const maxSteps = parts[1] ? Number.parseInt(parts[1], 10) : undefined;
      try {
        const result = await new AgentRunService(context.state, context.config).drain({
          runId,
          provider: context.provider,
          permissions: context.permissions,
          maxSteps,
        });
        return {
          message: [
            `agent drain: ${result.status}`,
            result.message,
            `steps=${result.steps.length}`,
            ...result.steps.map((step) => `- ${step.status}${step.task ? ` ${step.task.agent}:${step.task.title}` : ""} ${step.message}`),
          ].join("\n"),
          display: React.createElement(AgentPanel, { model: agentDrainPanelModel(result) }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed === "daemon" || trimmed.startsWith("daemon ")) {
      if (!context.provider) {
        return { message: "Provider missing; configure DEEPSEEK_API_KEY before running the agent daemon." };
      }
      const parts = parseArgs(trimmed.startsWith("daemon ") ? trimmed.slice("daemon ".length) : "");
      const selector = parts[0] ?? "all";
      const runId = selector === "all" ? undefined : resolveAgentRunId(selector, context);
      if (selector !== "all" && !runId) return { message: `Run not found: ${selector}` };
      const maxRuns = parts[1] ? Number.parseInt(parts[1], 10) : undefined;
      const maxStepsPerRun = parts[2] ? Number.parseInt(parts[2], 10) : undefined;
      try {
        const result = await new AgentDaemonService(context.state, context.config).tick({
          provider: context.provider,
          permissions: context.permissions,
          runId,
          maxRuns,
          maxStepsPerRun,
        });
        return {
          message: [
            `agent daemon: ${result.status}`,
            result.message,
            ...result.runs.map((run, index) => `- run ${index + 1} ${run.drain.status} steps=${run.drain.steps.length} ${run.drain.message}`),
          ].join("\n"),
          display: React.createElement(AgentPanel, { model: agentDaemonPanelModel(result) }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed === "validate" || trimmed.startsWith("validate ")) {
      const name = trimmed.startsWith("validate ") ? trimmed.slice("validate ".length).trim() : undefined;
      const results = service.validate(name);
      if (results.length === 0) {
        return {
          message: "No agents to validate.",
          display: React.createElement(AgentPanel, { model: agentValidationPanelModel(results) }),
        };
      }
      return {
        message: results.map((result) => [
          `${result.ok ? "ok" : "failed"} ${result.name} ${result.path}`,
          ...result.errors.map((error) => `  error: ${error}`),
          ...result.warnings.map((warning) => `  warning: ${warning}`),
        ].join("\n")).join("\n"),
        display: React.createElement(AgentPanel, { model: agentValidationPanelModel(results) }),
      };
    }
    if (trimmed === "path" || trimmed.startsWith("path ")) {
      const name = trimmed.startsWith("path ") ? trimmed.slice("path ".length).trim() : "";
      if (!name) return { message: `${context.config.projectPath}\\.deepseekcode\\agents` };
      const agent = service.load(name);
      return { message: agent ? agent.path : `Agent not found: ${name}` };
    }
    if (trimmed.startsWith("show ")) {
      const name = trimmed.slice("show ".length).trim();
      const agent = service.load(name);
      if (!agent) return { message: `Agent not found: ${name}` };
      return {
        message: [
          `${agent.scope}/${agent.name}`,
          agent.path,
          `description: ${agent.description || "(none)"}`,
          `model: ${agent.model}`,
          agent.tools?.length ? `tools: ${agent.tools.join(", ")}` : "tools: inherited",
          agent.skills?.length ? `skills: ${agent.skills.join(", ")}` : "",
          "",
          agent.prompt.slice(0, 4000) || "(empty agent prompt)",
        ].filter((line) => line !== "").join("\n"),
        display: React.createElement(AgentPanel, { model: agentDetailPanelModel(agent) }),
      };
    }

    const agents = service.list();
    if (agents.length === 0) {
      return {
        message: "No agent definitions discovered.",
        display: React.createElement(AgentPanel, { model: agentListPanelModel(agents) }),
      };
    }
    return {
      message: agents.map((agent) => `${agent.scope}/${agent.name} - ${agent.description || agent.path}`).join("\n"),
      display: React.createElement(AgentPanel, { model: agentListPanelModel(agents) }),
    };
  },
};

function parseArgs(args: string): string[] {
  return [...args.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? "",
  );
}

function summarizePayload(payload: unknown): string {
  const text = redactInternalAgentIds(JSON.stringify(payload ?? {}));
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function resolveAgentRunId(selector: string, context: Parameters<typeof resolveRunId>[1]): string | undefined {
  const runId = resolveRunId(selector, context);
  const run = runId ? context.state.getRun(runId) : undefined;
  if (run?.message.startsWith("agent:")) return run.id;
  if (runId && context.state.listJobs({ runId, kind: "agent_run", limit: 1 }).length > 0) return runId;
  return new AgentRunService(context.state, context.config).list(1)[0]?.run.id;
}

function redactInternalAgentIds(text: string): string {
  return text
    .replace(/\brun_[0-9a-f-]{8,}\b/gi, "agent run")
    .replace(/\btask_[0-9a-f-]{8,}\b/gi, "agent task");
}
