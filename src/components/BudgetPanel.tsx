import React from "react";
import { Box, Text } from "ink";
import type { InferenceBudget } from "../services/inference/inferenceSettingsService.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { ProgressBar } from "./design/ProgressBar.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";
import { EffortCallout, effortCalloutModel, type EffortCalloutModel } from "./EffortCallout.js";

export interface BudgetPanelModel {
  title: string;
  subtitle: string;
  badge: string;
  badgeTone: TerminalTone;
  rows: BudgetPanelRow[];
  callout?: EffortCalloutModel;
  footer: string;
}

export interface BudgetPanelRow {
  key: string;
  label: string;
  value: string;
  ratio: number;
  tone: TerminalTone;
  note: string;
}

const MAX_ACTION_CONTEXT = 28_000;
const MAX_ACTION_DYNAMIC = 36_000;
const MAX_SIDE_CONTEXT = 18_000;
const MAX_SIDE_DYNAMIC = 24_000;
const MAX_OUTPUT = 1_800;

export function BudgetPanel(props: {
  model: BudgetPanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(58, Math.min(112, columns - 4));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="budget" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={props.model.badge} tone={props.model.badgeTone} />
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {props.model.rows.map((row) => (
            <BudgetPanelRowView key={row.key} row={row} width={width} />
          ))}
        </Box>
        {props.model.callout ? <EffortCallout model={props.model.callout} width={width} /> : null}
        <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
      </Pane>
    </Box>
  );
}

export function budgetPanelModel(input: {
  budget: InferenceBudget;
  path?: string;
  action: "status" | "set" | "auto" | "path";
  runtimeMaxOutputTokens?: number;
}): BudgetPanelModel {
  return {
    title: input.action === "set"
      ? "Effort updated"
      : input.action === "auto"
        ? "Effort reset"
        : input.action === "path"
          ? "Effort config path"
          : "Effort budget",
    subtitle: input.path ?? "DeepSeek prompt and output budget",
    badge: input.budget.effort,
    badgeTone: toneForEffort(input.budget.effort),
    rows: [
      {
        key: "action-context",
        label: "context",
        value: `${input.budget.actionContextChars}`,
        ratio: input.budget.actionContextChars / MAX_ACTION_CONTEXT,
        tone: "brand",
        note: "stable project/action context budget",
      },
      {
        key: "dynamic",
        label: "dynamic",
        value: `${input.budget.actionDynamicChars}`,
        ratio: input.budget.actionDynamicChars / MAX_ACTION_DYNAMIC,
        tone: "warning",
        note: "dynamic request and selected-file budget",
      },
      {
        key: "side",
        label: "side",
        value: `${input.budget.sideQuestionContextChars}/${input.budget.sideQuestionDynamicChars}`,
        ratio: ((input.budget.sideQuestionContextChars / MAX_SIDE_CONTEXT) + (input.budget.sideQuestionDynamicChars / MAX_SIDE_DYNAMIC)) / 2,
        tone: "muted",
        note: "side-question context/dynamic budget",
      },
      {
        key: "output",
        label: "output",
        value: `${input.runtimeMaxOutputTokens ?? input.budget.maxOutputTokens}`,
        ratio: (input.runtimeMaxOutputTokens ?? input.budget.maxOutputTokens) / MAX_OUTPUT,
        tone: "success",
        note: "provider max output token cap",
      },
    ],
    callout: effortCalloutModel({
      effort: input.budget.effort,
    }),
    footer: "/effort low|medium|high|max|auto | /cache plan <goal>",
  };
}

function BudgetPanelRowView(props: {
  row: BudgetPanelRow;
  width: number;
}): React.ReactElement {
  const valueWidth = Math.max(8, Math.min(14, Math.floor(props.width * 0.14)));
  const noteWidth = Math.max(20, props.width - 46);
  const barWidth = Math.max(8, Math.min(22, props.width - valueWidth - noteWidth - 20));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row">
        <StatusBadge label={props.row.label} tone={props.row.tone} />
        <Text> </Text>
        <Text color="gray">{truncateCells(props.row.value.padEnd(valueWidth), valueWidth)}</Text>
        <ProgressBar ratio={props.row.ratio} width={barWidth} filledTone={props.row.tone} />
        <Text color="gray"> </Text>
        <Text color="gray">{truncateCells(props.row.note, noteWidth)}</Text>
      </Box>
    </Box>
  );
}

function toneForEffort(effort: string): TerminalTone {
  if (effort === "low") return "success";
  if (effort === "max") return "warning";
  if (effort === "auto") return "brand";
  return "muted";
}
