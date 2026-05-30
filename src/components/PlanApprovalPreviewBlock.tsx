import fs from "node:fs";
import path from "node:path";
import React from "react";
import { Box, Text } from "ink";
import { flattenCellText, truncateCells } from "./design/textLayout.js";

export interface PlanApprovalPreviewModel {
  title: string;
  path: string;
  size: string;
  preview: string[];
  clipped: boolean;
}

const DEFAULT_MAX_LINES = 8;
const DEFAULT_WIDTH = 96;

export function PlanApprovalPreviewBlock(props: {
  projectPath?: string;
  runId: string;
  width?: number;
  maxLines?: number;
}): React.ReactElement | null {
  const model = planApprovalPreviewModel(
    props.projectPath,
    props.runId,
    props.width ?? DEFAULT_WIDTH,
    props.maxLines ?? DEFAULT_MAX_LINES,
  );
  if (!model) return null;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text color="cyan">{model.title}</Text>
        {" "}
        <Text color="gray">{model.path}</Text>
      </Text>
      <Text color="gray">{model.size}</Text>
      {model.preview.map((line, index) => (
        <Text key={`${index}:${line}`} color="gray">{` ${line}`}</Text>
      ))}
      {model.clipped ? <Text color="gray"> ... plan preview clipped ...</Text> : null}
    </Box>
  );
}

export function planApprovalPreviewModel(
  projectPath: string | undefined,
  runId: string,
  width = DEFAULT_WIDTH,
  maxLines = DEFAULT_MAX_LINES,
): PlanApprovalPreviewModel | null {
  if (!projectPath) return null;
  const relativePath = path.join(".deepseekcode", "plans", `${safePlanName(runId)}.md`).replace(/\\/g, "/");
  const filePath = path.join(projectPath, relativePath);
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  return planApprovalPreviewModelFromContent(content, relativePath, width, maxLines);
}

export function planApprovalPreviewModelFromContent(
  content: string,
  relativePath: string,
  width = DEFAULT_WIDTH,
  maxLines = DEFAULT_MAX_LINES,
): PlanApprovalPreviewModel {
  const lines = content.split(/\r?\n/);
  const meaningful = lines
    .map((line) => flattenCellText(line.replace(/^#+\s*/, "")))
    .filter(Boolean);
  const preview = meaningful
    .slice(0, Math.max(0, maxLines))
    .map((line) => truncateCells(line, Math.max(24, width - 4)));
  return {
    title: "Plan preview",
    path: relativePath,
    size: `${content.length} chars / ${content ? lines.length : 0} lines`,
    preview,
    clipped: meaningful.length > preview.length,
  };
}

function safePlanName(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]/g, "-") || "current";
}
