import React from "react";
import { Box, Text } from "ink";
import type { AgentSummary } from "../agents/discovery.js";
import type { LoadedAgent } from "../agents/loader.js";
import type { AgentValidationResult } from "../agents/manifest.js";
import type { AgentRunDetail, AgentRunDrainResult, AgentRunSummary, AgentRunStepResult } from "../services/agents/agentRunService.js";
import type { AgentDaemonTickResult } from "../services/agents/agentDaemon.js";
import type { AgentWizardPlan } from "../services/agents/agentWizard.js";
import type { StartedAgentRun } from "../services/agents/agentRunService.js";
import type { TaskRecord } from "../state/sqlite.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { AgentProgressLine, agentProgressLineModel, type AgentProgressLineModel } from "./AgentProgressLine.js";
import { Pane } from "./design/Pane.js";
import { SelectList, type SelectListOption } from "./design/SelectList.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { Tabs, type TabItem } from "./design/Tabs.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface AgentPanelModel {
  title: string;
  subtitle: string;
  rows: AgentPanelRow[];
  progress?: AgentProgressLineModel[];
  preview?: string[];
  footer: string;
}

export interface AgentPanelRow {
  key: string;
  name: string;
  status: string;
  tone: TerminalTone;
  detail: string;
  note: string;
}

export function AgentPanel(props: {
  model: AgentPanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(58, Math.min(112, columns - 4));
  const groupOptions = agentPanelGroupOptions(props.model);
  const selectedGroup = groupOptions.find((option) => option.selected)?.id;
  const rowOptions = agentPanelRowOptions(props.model, selectedGroup);
  const progress = props.model.progress ?? [];
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="agents" tone={props.model.rows.length > 0 ? "brand" : "muted"} paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <Box flexDirection="column" alignItems="flex-end">
            <StatusBadge label={`${props.model.rows.length} rows`} tone={props.model.rows.length > 0 ? "brand" : "muted"} />
            <Text color="gray">{agentPanelStatusLine(props.model)}</Text>
          </Box>
        </Box>
        <Box marginTop={1}>
          <Tabs selectedId="agents" title="view" tabs={agentPanelTabs(props.model)} width={width} />
        </Box>
        {groupOptions.length > 0 ? (
          <>
            <Box marginTop={1}>
              <Text color="gray">sources / states</Text>
            </Box>
            <SelectList options={groupOptions} selectedIndex={0} visibleCount={5} width={width} />
          </>
        ) : null}
        <Box marginTop={1}>
          <Text color="gray">{selectedGroup ? `agents in ${selectedGroup}` : "agents"}</Text>
        </Box>
        {rowOptions.length > 0 ? (
          <SelectList options={rowOptions} selectedIndex={0} visibleCount={6} width={width} />
        ) : (
          <Text color="gray">No agents discovered</Text>
        )}
        {progress.length > 0 ? (
          <AgentProgressBlock progress={progress} width={width} />
        ) : null}
        {props.model.preview && props.model.preview.length > 0 ? (
          <AgentPreviewBlock lines={props.model.preview} width={width} />
        ) : null}
        <Box marginTop={1}>
          <Text color="gray">commands</Text>
        </Box>
        <SelectList options={agentPanelCommandOptions(props.model)} selectedIndex={0} visibleCount={5} width={width} />
        <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
      </Pane>
    </Box>
  );
}

export function agentListPanelModel(agents: AgentSummary[]): AgentPanelModel {
  return {
    title: "Agents",
    subtitle: `${agents.length} discovered agent${agents.length === 1 ? "" : "s"}`,
    rows: agents.map((agent) => ({
      key: `${agent.scope}/${agent.name}`,
      name: `${agent.scope}/${agent.name}`,
      status: agent.scope,
      tone: toneForScope(agent.scope),
      detail: agent.description || "(no description)",
      note: agent.path,
    })),
    footer: "/agents show <name> | /agents start <name> <task> | /agents create-smart <name> <goal>",
  };
}

export function agentDetailPanelModel(agent: LoadedAgent): AgentPanelModel {
  return {
    title: `Agent: ${agent.name}`,
    subtitle: `${agent.scope} / ${agent.path}`,
    rows: [{
      key: `${agent.scope}/${agent.name}`,
      name: `${agent.scope}/${agent.name}`,
      status: agent.model || "inherit",
      tone: toneForScope(agent.scope),
      detail: agent.description || agent.frontmatter.whenToUse || "(no description)",
      note: [
        agent.tools?.length ? `tools=${agent.tools.join(",")}` : "tools=inherited",
        agent.frontmatter.disallowedTools?.length ? `deny=${agent.frontmatter.disallowedTools.join(",")}` : "",
        agent.skills?.length ? `skills=${agent.skills.join(",")}` : "",
        agent.frontmatter.maxTurns ? `max-turns=${agent.frontmatter.maxTurns}` : "",
      ].filter(Boolean).join(" "),
    }],
    preview: previewLines(agent.prompt),
    footer: `/agents run ${agent.name} <task> | /agents validate ${agent.name}`,
  };
}

export function agentValidationPanelModel(results: AgentValidationResult[]): AgentPanelModel {
  return {
    title: "Agent validation",
    subtitle: `${results.length} validation result${results.length === 1 ? "" : "s"}`,
    rows: results.map((result) => ({
      key: result.name,
      name: result.name,
      status: result.ok ? "ok" : "failed",
      tone: result.ok ? "success" : "error",
      detail: result.path || "(missing)",
      note: [
        ...result.errors.map((error) => `error: ${error}`),
        ...result.warnings.map((warning) => `warning: ${warning}`),
      ].join("; "),
    })),
    footer: "/agents list | /agents show <name>",
  };
}

export function agentWizardPanelModel(plan: AgentWizardPlan): AgentPanelModel {
  return {
    title: "Agent wizard plan",
    subtitle: plan.description,
    rows: [{
      key: plan.name,
      name: plan.name,
      status: `${plan.maxTurns} turns`,
      tone: "brand",
      detail: `tools=${plan.tools.join(",")}`,
      note: [
        plan.disallowedTools.length ? `deny=${plan.disallowedTools.join(",")}` : "deny=none",
        `color=${plan.color}`,
      ].join(" "),
    }],
    preview: [...plan.rationale, "", ...previewLines(plan.prompt)],
    footer: `/agents create-smart ${plan.name} <goal>`,
  };
}

export function agentRunsPanelModel(runs: AgentRunSummary[]): AgentPanelModel {
  return {
    title: "Agent runs",
    subtitle: `${runs.length} recent run${runs.length === 1 ? "" : "s"}`,
    rows: runs.map(({ run, tasks }) => ({
      key: run.id,
      name: run.id,
      status: run.status,
      tone: toneForRunStatus(run.status),
      detail: run.message,
      note: taskSummary(tasks),
    })),
    progress: runs.flatMap(({ run, tasks }, runIndex) => {
      if (tasks.length > 0) return agentTaskProgressLines(tasks);
      return [agentProgressLineModel({
        key: run.id,
        agent: run.id,
        description: run.message || "(no message)",
        status: run.status,
        index: runIndex,
        total: runs.length,
        toolUseCount: run.actionCount,
        elapsedMs: run.updatedAtMs - run.createdAtMs,
        activity: `artifacts=${run.artifactCount} events=${run.eventCount}`,
      })];
    }),
    footer: "/agents detail <run-id|attached> | /agents step <run-id|attached> | /attach use <run-id>",
  };
}

export function agentRunDetailPanelModel(detail: AgentRunDetail): AgentPanelModel {
  return {
    title: `Agent run: ${detail.run.id}`,
    subtitle: `${detail.run.status} / actions ${detail.run.actionCount} / artifacts ${detail.run.artifactCount}`,
    rows: detail.tasks.map((task) => taskRow(task)),
    progress: agentTaskProgressLines(detail.tasks),
    preview: [
      `message: ${detail.run.message}`,
      ...detail.events.slice(0, 8).map((event) => `event: ${event.kind} ${summarizePayload(event.payload)}`),
    ],
    footer: `/agents step ${detail.run.id} | /agents drain ${detail.run.id}`,
  };
}

export function agentOperationPanelModel(input: {
  title: string;
  subtitle: string;
  name: string;
  status: string;
  detail: string;
  note?: string;
  footer: string;
  tone?: TerminalTone;
  progress?: AgentProgressLineModel[];
  preview?: string[];
}): AgentPanelModel {
  return {
    title: input.title,
    subtitle: input.subtitle,
    rows: [{
      key: input.name,
      name: input.name,
      status: input.status,
      tone: input.tone ?? toneForStatus(input.status),
      detail: input.detail,
      note: input.note ?? "",
    }],
    progress: input.progress,
    preview: input.preview,
    footer: input.footer,
  };
}

export function agentStartedPanelModel(result: StartedAgentRun): AgentPanelModel {
  return agentOperationPanelModel({
    title: "Agent run started",
    subtitle: result.runId,
    name: result.taskId,
    status: "queued",
    detail: "agent task queued",
    preview: [`task ${result.taskId} is queued for the next /agents step`],
    footer: `/attach use ${result.runId} | /agents step attached`,
  });
}

export function agentStepPanelModel(result: AgentRunStepResult): AgentPanelModel {
  return agentOperationPanelModel({
    title: "Agent step",
    subtitle: result.runId,
    name: result.task?.id ?? result.runId,
    status: result.status,
    detail: result.message,
    note: result.task ? `${result.task.agent}: ${result.task.title}` : "",
    progress: result.task ? [agentProgressLineModel({
      key: result.task.id,
      agent: result.task.agent,
      description: result.task.title,
      status: result.status,
      toolUseCount: result.result?.execution.results.length,
      elapsedMs: result.task.updatedAtMs - result.task.createdAtMs,
      activity: result.message,
    })] : undefined,
    preview: result.task ? [`${result.task.agent}: ${result.task.title}`, result.task.detail] : undefined,
    footer: `/agents detail ${result.runId} | /agents drain ${result.runId}`,
  });
}

export function agentDrainPanelModel(result: AgentRunDrainResult): AgentPanelModel {
  return agentOperationPanelModel({
    title: "Agent drain",
    subtitle: result.runId,
    name: result.runId,
    status: result.status,
    detail: result.message,
    note: `steps=${result.steps.length}`,
    progress: agentStepProgressLines(result.steps),
    preview: result.steps.slice(0, 8).map((step) => `${step.status}${step.task ? ` ${step.task.agent}:${step.task.title}` : ""} ${step.message}`),
    footer: `/agents detail ${result.runId}`,
  });
}

export function agentDaemonPanelModel(result: AgentDaemonTickResult): AgentPanelModel {
  return agentOperationPanelModel({
    title: "Agent daemon",
    subtitle: result.message,
    name: "daemon",
    status: result.status,
    detail: `${result.runs.length} run${result.runs.length === 1 ? "" : "s"} touched`,
    preview: result.runs.map((run) => `${run.runId} ${run.drain.status} steps=${run.drain.steps.length} ${run.drain.message}`),
    footer: "/agents runs | /agents daemon all",
  });
}

export function agentPanelTabs(model: AgentPanelModel): TabItem[] {
  return [
    { id: "agents", title: "agents", count: model.rows.length, tone: model.rows.length > 0 ? "brand" : "muted" },
    { id: "progress", title: "progress", count: model.progress?.length ?? 0, tone: model.progress?.length ? "brand" : "muted" },
    { id: "detail", title: "detail", count: model.preview?.length ?? 0, tone: model.preview?.length ? "brand" : "muted" },
    { id: "commands", title: "commands", count: agentPanelCommandOptions(model).length, tone: "muted" },
  ];
}

export function agentPanelGroupOptions(model: AgentPanelModel): SelectListOption[] {
  const groups = new Map<string, AgentPanelRow[]>();
  for (const row of model.rows) {
    const group = row.status || "unknown";
    const rows = groups.get(group) ?? [];
    rows.push(row);
    groups.set(group, rows);
  }
  return [...groups.entries()].map(([group, rows], index) => ({
    id: group,
    label: group,
    detail: `${rows.length} row${rows.length === 1 ? "" : "s"}`,
    description: rows.slice(0, 4).map((row) => row.name).join(", "),
    selected: index === 0,
    tone: groupTone(rows),
  }));
}

export function agentPanelRowOptions(model: AgentPanelModel, group?: string): SelectListOption[] {
  return model.rows
    .filter((row) => !group || row.status === group)
    .map((row, index) => ({
      id: row.key,
      label: row.name,
      detail: `${row.status} | ${row.detail}`,
      description: row.note,
      selected: index === 0,
      tone: row.tone,
    }));
}

export function agentPanelCommandOptions(model: AgentPanelModel): SelectListOption[] {
  const lowerTitle = model.title.toLowerCase();
  const primary = lowerTitle.includes("run")
    ? {
      id: "detail",
      label: "detail",
      detail: "/agents detail <run-id|attached>",
      description: "open task and event detail for an agent run",
      tone: "brand" as const,
    }
    : {
      id: "show",
      label: "show",
      detail: "/agents show <name>",
      description: "open an agent definition with tools and prompt preview",
      tone: "brand" as const,
    };
  return [
    primary,
    {
      id: "start",
      label: "start",
      detail: "/agents start <name> <task>",
      description: "queue a durable agent run that can be attached and stepped",
      tone: "success",
    },
    {
      id: "suggest",
      label: "suggest",
      detail: "/agents suggest <goal>",
      description: "generate a conservative agent plan before creating files",
      tone: "warning",
    },
    {
      id: "runs",
      label: "runs",
      detail: "/agents runs",
      description: "list recent agent runs and task counts",
      tone: "muted",
    },
    {
      id: "validate",
      label: "validate",
      detail: "/agents validate [name]",
      description: "check agent frontmatter, prompt body, and tool policy",
      tone: "muted",
    },
  ];
}

function AgentProgressBlock(props: {
  progress: AgentProgressLineModel[];
  width: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray">progress</Text>
      {props.progress.slice(0, 8).map((line) => (
        <AgentProgressLine key={line.key} model={line} width={props.width} />
      ))}
    </Box>
  );
}

function AgentPreviewBlock(props: {
  lines: string[];
  width: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Text color="gray">agent detail</Text>
      {props.lines.slice(0, 8).map((line, index) => (
        <Text key={`${index}-${line}`} color="gray">{truncateCells(`  ${line}`, Math.max(24, props.width - 4))}</Text>
      ))}
    </Box>
  );
}

function agentPanelStatusLine(model: AgentPanelModel): string {
  const groups = agentPanelGroupOptions(model);
  if (groups.length === 0) return "no agents";
  return groups.slice(0, 3).map((group) => `${group.id} ${(group.detail ?? "0").split(" ")[0]}`).join(" | ");
}

function groupTone(rows: AgentPanelRow[]): TerminalTone {
  if (rows.some((row) => row.tone === "error")) return "error";
  if (rows.some((row) => row.tone === "warning")) return "warning";
  if (rows.some((row) => row.tone === "success")) return "success";
  if (rows.some((row) => row.tone === "brand")) return "brand";
  return "muted";
}

function taskRow(task: TaskRecord): AgentPanelRow {
  return {
    key: task.id,
    name: task.id,
    status: task.status,
    tone: toneForStatus(task.status),
    detail: `${task.agent}: ${task.title}`,
    note: task.detail,
  };
}

function taskSummary(tasks: TaskRecord[]): string {
  if (tasks.length === 0) return "tasks=none";
  const counts = new Map<string, number>();
  for (const task of tasks) counts.set(task.status, (counts.get(task.status) ?? 0) + 1);
  return [...counts.entries()].map(([status, count]) => `${status}=${count}`).join(" ");
}

function agentTaskProgressLines(tasks: TaskRecord[]): AgentProgressLineModel[] {
  return tasks.map((task, index) => agentProgressLineModel({
    key: task.id,
    agent: task.agent,
    description: task.title,
    status: task.status,
    index,
    total: tasks.length,
    elapsedMs: task.updatedAtMs - task.createdAtMs,
    activity: task.detail,
  }));
}

function agentStepProgressLines(steps: AgentRunStepResult[]): AgentProgressLineModel[] {
  const taskSteps = steps.filter((step): step is AgentRunStepResult & { task: TaskRecord } => Boolean(step.task));
  return taskSteps.map((step, index) => agentProgressLineModel({
    key: step.task.id,
    agent: step.task.agent,
    description: step.task.title,
    status: step.status,
    index,
    total: taskSteps.length,
    toolUseCount: step.result?.execution.results.length,
    elapsedMs: step.task.updatedAtMs - step.task.createdAtMs,
    activity: step.message,
  }));
}

function toneForScope(scope: AgentSummary["scope"]): TerminalTone {
  if (scope === "project") return "success";
  if (scope === "user") return "brand";
  if (scope === "plugin") return "warning";
  return "muted";
}

function toneForRunStatus(status: string): TerminalTone {
  return toneForStatus(status);
}

function toneForStatus(status: string): TerminalTone {
  if (status === "succeeded" || status === "ok") return "success";
  if (status === "failed" || status === "cancelled") return "error";
  if (status === "running" || status === "queued" || status === "paused" || status === "max_steps") return "warning";
  return "muted";
}

function previewLines(prompt: string): string[] {
  return prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== "---")
    .slice(0, 6);
}

function summarizePayload(payload: unknown): string {
  const text = JSON.stringify(payload ?? {});
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}
