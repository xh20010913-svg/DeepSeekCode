import React from "react";
import { Box, Text } from "ink";
import { parseActionSummary } from "./ActionSummaryBlock.js";

export interface FileEditPreviewModel {
  action: "write_file" | "apply_patch";
  title: string;
  path: string;
  operation: string;
  impact: string;
  detail: string;
  change: string;
  fingerprint: string;
  risk: "low" | "medium" | "high";
  hint: string;
}

export function FileEditPreviewBlock(props: {
  summary: string;
}): React.ReactElement | null {
  const model = fileEditPreviewModel(props.summary);
  if (!model) return null;

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={riskColor(model.risk)}>{model.title}</Text>
        {" "}
        <Text color="gray">{model.risk}</Text>
      </Text>
      <PreviewRow label="path" value={model.path} />
      <PreviewRow label="operation" value={model.operation} />
      <PreviewRow label="impact" value={model.impact} />
      {model.detail ? <PreviewRow label="detail" value={model.detail} /> : null}
      {model.change ? <PreviewRow label="change" value={model.change} color={changeColor(model.change)} /> : null}
      {model.fingerprint ? <PreviewRow label="sha" value={model.fingerprint} /> : null}
      <PreviewRow label="preview" value={model.hint} color="gray" />
    </Box>
  );
}

export function fileEditPreviewModel(summary: string): FileEditPreviewModel | null {
  const parsed = parseActionSummary(summary);
  if (!parsed) return null;
  const fields = Object.fromEntries(parsed.fields.map((field) => [field.key, field.value]));

  if (parsed.action === "write_file") {
    const overwrite = fields.overwrite === "true";
    const chars = parseInteger(fields.chars);
    const lines = parseInteger(fields.lines);
    const change = projectedChange(fields);
    return {
      action: "write_file",
      title: overwrite ? "Overwrite file" : "Create file",
      path: fields.path || "(unknown)",
      operation: overwrite ? "replace file content" : "write new file",
      impact: chars === undefined ? "unknown size" : `${chars} chars`,
      detail: lines === undefined ? "" : `${lines} line${lines === 1 ? "" : "s"}`,
      change,
      fingerprint: fields.sha || "",
      risk: overwrite ? "high" : "medium",
      hint: overwrite ? "approve, then inspect with /diff git" : "approve to create, then inspect with /diff git",
    };
  }

  if (parsed.action === "apply_patch") {
    const edits = parseInteger(fields.edits);
    const searchChars = parseInteger(fields.searchChars);
    const replaceChars = parseInteger(fields.replaceChars);
    const change = projectedChange(fields);
    return {
      action: "apply_patch",
      title: "Apply patch",
      path: fields.path || "(unknown)",
      operation: "search/replace edits",
      impact: edits === undefined ? "unknown edits" : `${edits} edit${edits === 1 ? "" : "s"}`,
      detail: searchChars === undefined || replaceChars === undefined
        ? ""
        : `${searchChars} search chars -> ${replaceChars} replace chars`,
      change,
      fingerprint: fields.sha || "",
      risk: "high",
      hint: "approve, then inspect with /diff git",
    };
  }

  return null;
}

function PreviewRow(props: {
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

function parseInteger(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  return Number(value);
}

function projectedChange(fields: Record<string, string>): string {
  const projected = fields.projected;
  if (!projected) return "";
  if (projected !== "ok") return `projection ${projected}`;
  const added = parseInteger(fields.added);
  const removed = parseInteger(fields.removed);
  const oldLines = parseInteger(fields.oldLines);
  const newLines = parseInteger(fields.newLines);
  const exists = fields.exists ? `exists ${fields.exists}` : "";
  const delta = added === undefined || removed === undefined ? "diff ready" : `+${added} -${removed}`;
  const size = oldLines === undefined || newLines === undefined ? "" : `${oldLines} -> ${newLines} lines`;
  return [delta, size, exists].filter(Boolean).join(" | ");
}

function riskColor(risk: FileEditPreviewModel["risk"]): string {
  if (risk === "high") return "yellow";
  if (risk === "medium") return "cyan";
  return "green";
}

function changeColor(change: string): string {
  if (/projection/.test(change)) return "yellow";
  if (/\+\d+ -0/.test(change)) return "green";
  return "gray";
}
