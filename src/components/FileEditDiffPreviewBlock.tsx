import React from "react";
import { Box, Text } from "ink";
import { readFileEditApprovalPreview, type FileEditApprovalPreviewRecord } from "../services/approval/fileEditApprovalPreview.js";
import { diffLineColor } from "./StructuredDiff.js";
import { truncateCells } from "./design/textLayout.js";

export interface FileEditDiffPreviewModel {
  status: "ok" | "unavailable";
  title: string;
  meta: string;
  lines: string[];
  clipped: boolean;
  unavailableReason: string;
}

const DEFAULT_MAX_LINES = 44;
const DEFAULT_WIDTH = 96;

export function FileEditDiffPreviewBlock(props: {
  projectPath?: string;
  gateId: string;
  maxLines?: number;
  width?: number;
}): React.ReactElement | null {
  const model = fileEditDiffPreviewModel(props.projectPath, props.gateId, props.maxLines ?? DEFAULT_MAX_LINES);
  if (!model) return null;
  const width = props.width ?? DEFAULT_WIDTH;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text color="cyan">{model.title}</Text>
        {" "}
        <Text color="gray">{truncateCells(model.meta, Math.max(16, width - 14))}</Text>
      </Text>
      {model.status === "unavailable" ? (
        <Text color="yellow">{`preview unavailable: ${model.unavailableReason}`}</Text>
      ) : (
        <Box flexDirection="column">
          {model.lines.map((line, index) => (
            <Text key={`${index}:${line.slice(0, 12)}`} color={diffLineColor(line)}>
              {truncateCells(line || " ", width)}
            </Text>
          ))}
          {model.clipped ? <Text color="gray">... diff preview clipped ...</Text> : null}
        </Box>
      )}
    </Box>
  );
}

export function fileEditDiffPreviewModel(
  projectPath: string | undefined,
  gateId: string,
  maxLines = DEFAULT_MAX_LINES,
): FileEditDiffPreviewModel | null {
  if (!projectPath) return null;
  const record = readFileEditApprovalPreview(projectPath, gateId);
  if (!record) return null;
  return fileEditDiffPreviewModelFromRecord(record, maxLines);
}

export function fileEditDiffPreviewModelFromRecord(
  record: FileEditApprovalPreviewRecord,
  maxLines = DEFAULT_MAX_LINES,
): FileEditDiffPreviewModel {
  const lines = record.diffLines.slice(0, Math.max(0, maxLines));
  return {
    status: record.status,
    title: "Diff preview",
    meta: `${record.action} ${record.relativePath} | +${record.added} -${record.removed}`,
    lines,
    clipped: record.clipped || record.diffLines.length > lines.length,
    unavailableReason: record.unavailableReason ?? "unavailable",
  };
}
