import React from "react";
import { Box, Text } from "ink";
import type { CachePromptPlan, CacheBlockPriority } from "../services/cache/resonixPolicy.js";
import { buildCacheStabilityReport, formatCacheStabilityReport } from "../services/cache/cacheStability.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { ProgressBar } from "./design/ProgressBar.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface CachePlanPanelModel {
  title: string;
  subtitle: string;
  badge: string;
  ratio: number;
  summary: string;
  stabilityBadge: string;
  stabilityTone: TerminalTone;
  stabilitySummary: string;
  shapeNote: string;
  rows: CachePlanPanelRow[];
  recommendation: string;
  footer: string;
}

export interface CachePlanPanelRow {
  key: string;
  label: string;
  title: string;
  chars: string;
  tone: TerminalTone;
  note: string;
}

export function CachePlanPanel(props: {
  model: CachePlanPanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(62, Math.min(116, columns - 4));
  const titleWidth = Math.max(18, width - 58);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="cache plan" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={props.model.badge} tone="brand" />
        </Box>
        <Box flexDirection="row" marginTop={1}>
          <StatusBadge label="dynamic" tone={props.model.ratio > 0.9 ? "warning" : "success"} />
          <Text> </Text>
          <ProgressBar ratio={props.model.ratio} width={Math.max(12, Math.min(28, width - 48))} showPercent />
          <Text color="gray"> {truncateCells(props.model.summary, Math.max(16, width - 46))}</Text>
        </Box>
        <Box flexDirection="row">
          <StatusBadge label="stability" tone={props.model.stabilityTone} />
          <Text> {props.model.stabilityBadge}</Text>
          <Text color="gray"> {truncateCells(props.model.stabilitySummary, Math.max(16, width - 24))}</Text>
        </Box>
        <Box flexDirection="row">
          <StatusBadge label="shape" tone="brand" />
          <Text color="gray"> {truncateCells(props.model.shapeNote, Math.max(16, width - 12))}</Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {props.model.rows.map((row) => (
            <Box key={row.key} flexDirection="row">
              <StatusBadge label={row.label} tone={row.tone} />
              <Text color="gray"> {truncateCells(row.chars.padStart(7), 7)} </Text>
              <Text>{truncateCells(row.title.padEnd(titleWidth), titleWidth)}</Text>
              <Text color="gray"> {truncateCells(row.note, Math.max(10, width - titleWidth - 24))}</Text>
            </Box>
          ))}
        </Box>
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">{truncateCells(props.model.recommendation, Math.max(24, width - 4))}</Text>
          <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
        </Box>
      </Pane>
    </Box>
  );
}

export function buildCachePlanPanelModel(input: {
  goal: string;
  effort: string;
  plan: CachePromptPlan;
  maxDynamicChars: number;
  shapeNote?: string;
}): CachePlanPanelModel {
  const plannedChars = input.plan.blocks.reduce((sum, block) => sum + block.chars, 0);
  const truncatedCount = input.plan.blocks.filter((block) => block.truncated).length;
  const ratio = input.maxDynamicChars > 0 ? plannedChars / input.maxDynamicChars : 0;
  const stability = buildCacheStabilityReport(input.plan);
  return {
    title: "DeepSeek cache plan",
    subtitle: input.goal,
    badge: input.effort,
    ratio,
    summary: `tokens~${input.plan.approxTokens} dropped=${input.plan.droppedChars}`,
    stabilityBadge: stability.risk,
    stabilityTone: stabilityTone(stability.risk),
    stabilitySummary: formatCacheStabilityReport(stability),
    shapeNote: input.shapeNote ?? "shape fingerprint is content-free; repeated shapes usually improve DeepSeek cache-hit odds.",
    rows: input.plan.blocks.map((block) => ({
      key: `${block.priority}:${block.title}`,
      label: priorityLabel(block.priority),
      title: block.title,
      chars: String(block.chars),
      tone: block.truncated ? "warning" : toneForPriority(block.priority),
      note: block.truncated ? "truncated by dynamic budget" : noteForPriority(block.priority),
    })),
    recommendation: recommendationFor(input.plan.droppedChars, truncatedCount, stability.recommendation),
    footer: "/cache pin add <name> <fact> | /effort low|medium|high|max | /cache doctor",
  };
}

function priorityLabel(priority: CacheBlockPriority): string {
  if (priority === "sticky") return "pin";
  if (priority === "project") return "project";
  if (priority === "context") return "context";
  if (priority === "feedback") return "feedback";
  return "request";
}

function toneForPriority(priority: CacheBlockPriority): TerminalTone {
  if (priority === "sticky") return "success";
  if (priority === "project") return "brand";
  if (priority === "context") return "muted";
  if (priority === "feedback") return "warning";
  return "success";
}

function noteForPriority(priority: CacheBlockPriority): string {
  if (priority === "sticky") return "stable prefix";
  if (priority === "project") return "cache-friendly prefix";
  if (priority === "context") return "dynamic context";
  if (priority === "feedback") return "append-only feedback";
  return "latest turn preserved";
}

function recommendationFor(droppedChars: number, truncatedCount: number, stabilityRecommendation: string): string {
  if (droppedChars <= 0 && truncatedCount === 0) {
    return stabilityRecommendation;
  }
  return "Dynamic context was clipped: pin stable facts, narrow selected files, or raise /effort before a large edit.";
}

function stabilityTone(risk: string): TerminalTone {
  if (risk === "high") return "error";
  if (risk === "medium") return "warning";
  return "success";
}
