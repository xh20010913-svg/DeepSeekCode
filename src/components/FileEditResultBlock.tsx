import React from "react";
import { Box, Text } from "ink";

export interface FileEditResultModel {
  operation: "patch" | "write";
  change: string;
  edits?: number;
}

export function FileEditResultBlock(props: {
  action: string;
  message?: string;
}): React.ReactElement | null {
  const model = fileEditResultModel(props.action, props.message ?? "");
  if (!model) return null;

  return (
    <Box flexDirection="column">
      <FileEditRow label="change" value={model.change} />
      {model.edits !== undefined ? <FileEditRow label="edits" value={String(model.edits)} /> : null}
    </Box>
  );
}

export function fileEditResultModel(action: string, message = ""): FileEditResultModel | null {
  const trimmed = message.trim();
  if (action === "write_file") {
    return {
      operation: "write",
      change: trimmed || "file written",
    };
  }

  if (action === "apply_patch") {
    const edits = Number(trimmed.match(/^(\d+)\s+edits?$/i)?.[1] ?? NaN);
    return {
      operation: "patch",
      change: Number.isFinite(edits)
        ? `${edits} edit${edits === 1 ? "" : "s"} applied`
        : trimmed || "patch applied",
      ...(Number.isFinite(edits) ? { edits } : {}),
    };
  }

  return null;
}

function FileEditRow(props: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <Box flexDirection="row">
      <Text color="gray">{props.label.padEnd(7)} </Text>
      <Text color="gray">{props.value}</Text>
    </Box>
  );
}
