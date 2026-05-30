import React from "react";
import { Box, Text } from "ink";
import { parseActionSummary } from "./ActionSummaryBlock.js";
import { truncateCells } from "./design/textLayout.js";

export interface RemoteFileApprovalPreviewModel {
  action: "ssh_write_file";
  title: string;
  profile: string;
  path: string;
  operation: string;
  impact: string;
  fingerprint: string;
  risk: "medium" | "high";
  note: string;
}

export function RemoteFileApprovalPreviewBlock(props: {
  summary: string;
  width?: number;
}): React.ReactElement | null {
  const model = remoteFileApprovalPreviewModel(props.summary);
  if (!model) return null;
  const width = props.width ?? 96;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text color={model.risk === "high" ? "yellow" : "cyan"}>{model.title}</Text>
        {" "}
        <Text color="gray">{model.risk}</Text>
      </Text>
      <PreviewRow label="profile" value={model.profile} width={width} />
      <PreviewRow label="path" value={model.path} width={width} />
      <PreviewRow label="operation" value={model.operation} width={width} />
      <PreviewRow label="impact" value={model.impact} width={width} />
      {model.fingerprint ? <PreviewRow label="sha" value={model.fingerprint} width={width} /> : null}
      <PreviewRow label="note" value={model.note} width={width} color="gray" />
    </Box>
  );
}

export function remoteFileApprovalPreviewModel(summary: string): RemoteFileApprovalPreviewModel | null {
  const parsed = parseActionSummary(summary);
  if (!parsed || parsed.action !== "ssh_write_file") return null;
  const fields = Object.fromEntries(parsed.fields.map((field) => [field.key, field.value]));
  const overwrite = fields.overwrite === "true";
  const lines = fields.lines ? ` / ${fields.lines} lines` : "";
  return {
    action: "ssh_write_file",
    title: overwrite ? "Overwrite remote file" : "Create remote file",
    profile: fields.profile || "(unknown)",
    path: fields.path || "(unknown path)",
    operation: overwrite ? "replace remote file content" : "write new remote file",
    impact: `${fields.chars || "0"} chars${lines}`,
    fingerprint: fields.sha || "",
    risk: overwrite ? "high" : "medium",
    note: "remote file writes cannot be locally diff-previewed; inspect the target profile carefully",
  };
}

function PreviewRow(props: {
  label: string;
  value: string;
  width: number;
  color?: string;
}): React.ReactElement {
  return (
    <Box flexDirection="row">
      <Text color="gray">{props.label.padEnd(9)} </Text>
      <Text color={props.color ?? "gray"}>{truncateCells(props.value, Math.max(16, props.width - 12))}</Text>
    </Box>
  );
}
