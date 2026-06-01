import React from "react";
import { Box, Text } from "ink";
import { fileEditPreviewModel, type FileEditPreviewModel } from "./FileEditPreviewBlock.js";
import {
  fileEditDiffPreviewModel,
  type FileEditDiffPreviewModel,
} from "./FileEditDiffPreviewBlock.js";
import { diffLineColor } from "./StructuredDiff.js";
import { SelectList, type SelectListOption } from "./design/SelectList.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { Tabs, type TabItem } from "./design/Tabs.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface FileEditReviewPanelModel {
  title: string;
  subtitle: string;
  risk: FileEditPreviewModel["risk"];
  riskTone: TerminalTone;
  tabs: TabItem[];
  summaryRows: FileEditReviewRow[];
  decisionOptions: SelectListOption[];
  diff: FileEditDiffPreviewModel | null;
}

export interface FileEditReviewRow {
  key: string;
  label: string;
  status: string;
  tone: TerminalTone;
  detail: string;
}

export function FileEditReviewPanel(props: {
  summary: string;
  projectPath?: string;
  gateId: string;
  width?: number;
  maxLines?: number;
}): React.ReactElement | null {
  const model = fileEditReviewPanelModel({
    summary: props.summary,
    projectPath: props.projectPath,
    gateId: props.gateId,
    maxLines: props.maxLines,
  });
  if (!model) return null;
  const width = props.width ?? 96;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexDirection="column">
          <Text color="cyan">{model.title}</Text>
          <Text color="gray">{truncateCells(model.subtitle, Math.max(24, width - 20))}</Text>
        </Box>
        <StatusBadge label={model.risk} tone={model.riskTone} />
      </Box>
      <Box marginTop={1}>
        <Tabs tabs={model.tabs} selectedId="summary" title="review" width={width} />
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {model.summaryRows.map((row) => (
          <ReviewRow key={row.key} row={row} width={width} />
        ))}
      </Box>
      {model.diff ? <DiffPreview model={model.diff} width={width} /> : null}
      <Box marginTop={1}>
        <Text color="gray">decision</Text>
      </Box>
      <SelectList options={model.decisionOptions} selectedIndex={0} visibleCount={4} width={width} />
    </Box>
  );
}

export function fileEditReviewPanelModel(input: {
  summary: string;
  projectPath?: string;
  gateId: string;
  maxLines?: number;
}): FileEditReviewPanelModel | null {
  const preview = fileEditPreviewModel(input.summary);
  if (!preview) return null;
  const diff = fileEditDiffPreviewModel(input.projectPath, input.gateId, input.maxLines ?? 28);
  const diffCount = diff?.status === "ok" ? diff.lines.length : 0;
  return {
    title: preview.title,
    subtitle: preview.path,
    risk: preview.risk,
    riskTone: riskTone(preview.risk),
    tabs: [
      { id: "summary", title: "summary", tone: "brand" },
      {
        id: "diff",
        title: diff?.status === "unavailable" ? "diff n/a" : "diff",
        count: diffCount,
        tone: diff?.status === "unavailable" ? "warning" : diff ? "success" : "muted",
      },
      { id: "decision", title: "decision", tone: "muted" },
    ],
    summaryRows: [
      row("path", "path", "target", "brand", preview.path),
      row("operation", "operation", operationStatus(preview), riskTone(preview.risk), preview.operation),
      row("impact", "impact", preview.impact, impactTone(preview.change), preview.detail || "size metadata unavailable"),
      row("change", "change", preview.change ? "projected" : "unknown", preview.change ? "success" : "muted", preview.change || "no projected diff metadata"),
      row("fingerprint", "fingerprint", preview.fingerprint ? "sha" : "none", preview.fingerprint ? "muted" : "warning", preview.fingerprint || "approval fingerprint unavailable"),
    ],
    decisionOptions: decisionOptions(input.gateId, preview),
    diff,
  };
}

function ReviewRow(props: {
  row: FileEditReviewRow;
  width: number;
}): React.ReactElement {
  const detailWidth = Math.max(18, props.width - 34);
  return (
    <Box flexDirection="row">
      <StatusBadge label={props.row.status} tone={props.row.tone} />
      <Text> </Text>
      <Text color="cyan">{truncateCells(props.row.label.padEnd(12), 12)}</Text>
      <Text color="gray">{truncateCells(props.row.detail, detailWidth)}</Text>
    </Box>
  );
}

function DiffPreview(props: {
  model: FileEditDiffPreviewModel;
  width: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text color="cyan">{props.model.title}</Text>
        {" "}
        <Text color="gray">{truncateCells(props.model.meta, Math.max(18, props.width - 16))}</Text>
      </Text>
      {props.model.status === "unavailable" ? (
        <Text color="yellow">{`preview unavailable: ${props.model.unavailableReason}`}</Text>
      ) : (
        <Box flexDirection="column">
          {props.model.lines.map((line, index) => (
            <Text key={`${index}:${line.slice(0, 16)}`} color={diffLineColor(line)}>
              {truncateCells(line || " ", props.width)}
            </Text>
          ))}
          {props.model.clipped ? <Text color="gray">... diff preview clipped ...</Text> : null}
        </Box>
      )}
    </Box>
  );
}

function decisionOptions(gateId: string, preview: FileEditPreviewModel): SelectListOption[] {
  void gateId;
  return [
    {
      id: "inspect",
      label: "inspect",
      detail: "D",
      description: "review workspace diff after the edit is retried",
      tone: "brand",
    },
    {
      id: "approve",
      label: "approve once",
      detail: "Enter / Y",
      description: "allow this exact file edit fingerprint",
      tone: "success",
    },
    {
      id: "reject",
      label: "reject",
      detail: "N",
      description: "block this edit and send feedback",
      tone: "error",
    },
  ];
}

function row(
  key: string,
  label: string,
  status: string,
  tone: TerminalTone,
  detail: string,
): FileEditReviewRow {
  return { key, label, status, tone, detail };
}

function riskTone(risk: FileEditPreviewModel["risk"]): TerminalTone {
  if (risk === "high") return "warning";
  if (risk === "medium") return "brand";
  return "success";
}

function impactTone(change: string): TerminalTone {
  if (!change) return "muted";
  if (/projection/.test(change)) return "warning";
  return "success";
}

function operationStatus(preview: FileEditPreviewModel): string {
  if (preview.action === "apply_patch") return "patch";
  return preview.operation.includes("new") ? "create" : "overwrite";
}
