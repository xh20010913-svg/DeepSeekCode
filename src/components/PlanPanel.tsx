import React from "react";
import { Box, Text } from "ink";
import { Pane } from "./design/Pane.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { flattenCellText, truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { formatPlanReference, type PlanRecord } from "../services/plans/planModeService.js";

export interface PlanPanelCommand {
  label: string;
  command: string;
  description: string;
  tone: "allow" | "reject" | "inspect" | "neutral";
}

export interface PlanPanelModel {
  title: string;
  runId: string;
  runLabel: string;
  path: string;
  chars: number;
  lines: number;
  approval: string;
  status: string;
  summary: string;
  preview: string[];
  commands: PlanPanelCommand[];
}

export function PlanPanel(props: {
  record: PlanRecord;
  title?: string;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(42, Math.min(104, columns - 4));
  const model = planPanelModel(props.record, props.title);
  return (
    <Pane width={width} title={model.title} tone={toneForStatus(model.status)} paddingX={1}>
      <Text>
        <StatusBadge label={model.status} tone={toneForStatus(model.status)} />
        {" "}
        <Text color="gray">{model.runLabel}</Text>
      </Text>
      <PlanRow label="path" value={model.path} />
      <PlanRow label="size" value={`${model.chars} chars / ${model.lines} lines`} />
      <PlanRow label="approval" value={model.approval} color={model.status === "pending" ? "yellow" : "gray"} />
      <PlanRow label="summary" value={model.summary} />
      {model.preview.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">preview</Text>
          {model.preview.map((line, index) => (
            <Text key={`${index}-${line}`} color="gray">{` ${line}`}</Text>
          ))}
        </Box>
      ) : null}
      <CommandRows commands={model.commands} />
    </Pane>
  );
}

export function planPanelModel(record: PlanRecord, title = "Plan mode"): PlanPanelModel {
  const lines = record.content ? record.content.split(/\r?\n/) : [];
  const gate = record.gate;
  const status = gate?.status ?? (record.content.trim() ? "draft" : "empty");
  return {
    title,
    runId: record.runId,
    runLabel: displayRunLabel(record.runId),
    path: formatPlanReference(record.relativePath),
    chars: record.content.length,
    lines: record.content ? lines.length : 0,
    approval: gate ? gate.status : "none",
    status,
    summary: gate?.summary || firstMeaningfulLine(record.content) || "No plan content yet",
    preview: previewLines(record.content, 8, 96),
    commands: planCommands(record),
  };
}

function planCommands(record: PlanRecord): PlanPanelCommand[] {
  const commands: PlanPanelCommand[] = [
    {
      label: "show",
      command: "/plan show",
      description: "print the full draft",
      tone: "inspect",
    },
    {
      label: "path",
      command: "/plan path",
      description: "locate the markdown plan",
      tone: "inspect",
    },
  ];

  if (record.gate?.status === "pending") {
    commands.push(
      {
        label: "approve",
        command: "/plan approve latest <reason>",
        description: "continue from this plan",
        tone: "allow",
      },
      {
        label: "reject",
        command: "/plan reject latest <reason>",
        description: "ask for another plan",
        tone: "reject",
      },
      {
        label: "cancel",
        command: "/plan cancel latest <reason>",
        description: "close the gate",
        tone: "neutral",
      },
    );
    return commands;
  }

  if (record.content.trim()) {
    commands.push({
      label: "submit",
      command: "/plan exit",
      description: "request approval for this draft",
      tone: "allow",
    });
  }
  return commands;
}

function previewLines(content: string, maxLines: number, maxCells: number): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => flattenCellText(line))
    .filter(Boolean)
    .slice(0, maxLines)
    .map((line) => truncateCells(line, maxCells));
}

function firstMeaningfulLine(content: string): string {
  return previewLines(content, 1, 96)[0] ?? "";
}

function displayRunLabel(runId: string): string {
  return /^run_[0-9a-f-]{8,}$/i.test(runId) ? "current run" : runId;
}

function CommandRows(props: {
  commands: PlanPanelCommand[];
}): React.ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray">commands</Text>
      {props.commands.map((command, index) => (
        <Box key={`${command.label}-${command.command}`} flexDirection="row">
          <Text color={commandTone(command.tone)}>{` ${index + 1}. ${command.label.padEnd(8)} `}</Text>
          <Text color="gray">{command.command}</Text>
          <Text color="gray">{`  ${command.description}`}</Text>
        </Box>
      ))}
    </Box>
  );
}

function PlanRow(props: {
  label: string;
  value: string;
  color?: string;
}): React.ReactElement {
  return (
    <Box flexDirection="row">
      <Text color="gray">{props.label.padEnd(9)} </Text>
      <Text color={props.color ?? "gray"}>{props.value}</Text>
    </Box>
  );
}

function toneForStatus(status: string): TerminalTone {
  if (status === "approved") return "success";
  if (status === "pending" || status === "draft") return "warning";
  if (status === "empty") return "muted";
  return "error";
}

function commandTone(tone: PlanPanelCommand["tone"]): string {
  if (tone === "allow") return "green";
  if (tone === "reject") return "red";
  if (tone === "inspect") return "cyan";
  return "gray";
}
