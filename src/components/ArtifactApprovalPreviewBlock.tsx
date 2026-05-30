import React from "react";
import { Box, Text } from "ink";
import { parseActionSummary } from "./ActionSummaryBlock.js";
import { truncateCells } from "./design/textLayout.js";

export interface ArtifactApprovalPreviewModel {
  action: "create_docx" | "create_pdf" | "computer_use";
  title: string;
  targetLabel: string;
  target: string;
  sizeLabel: string;
  size: string;
  risk: "medium" | "high";
  note: string;
}

export function ArtifactApprovalPreviewBlock(props: {
  summary: string;
  width?: number;
}): React.ReactElement | null {
  const model = artifactApprovalPreviewModel(props.summary);
  if (!model) return null;
  const width = props.width ?? 96;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text color={riskColor(model.risk)}>{model.title}</Text>
        {" "}
        <Text color="gray">{model.risk}</Text>
      </Text>
      <PreviewRow label={model.targetLabel} value={model.target} width={width} />
      <PreviewRow label={model.sizeLabel} value={model.size} width={width} />
      <PreviewRow label="note" value={model.note} width={width} color="gray" />
    </Box>
  );
}

export function artifactApprovalPreviewModel(summary: string): ArtifactApprovalPreviewModel | null {
  const parsed = parseActionSummary(summary);
  if (!parsed) return null;
  const fields = Object.fromEntries(parsed.fields.map((field) => [field.key, field.value]));

  if (parsed.action === "create_docx" || parsed.action === "create_pdf") {
    const kind = parsed.action === "create_docx" ? "DOCX" : "PDF";
    return {
      action: parsed.action,
      title: `Create ${kind}`,
      targetLabel: "path",
      target: fields.path || "(unknown path)",
      sizeLabel: "input",
      size: `${fields.markdownChars || "0"} markdown chars`,
      risk: "medium",
      note: "writes a generated document artifact after approval",
    };
  }

  if (parsed.action === "computer_use") {
    return {
      action: "computer_use",
      title: "Computer use",
      targetLabel: "target",
      target: "local desktop automation",
      sizeLabel: "request",
      size: `${fields.instructionChars || "0"} instruction chars`,
      risk: "high",
      note: "may control visible desktop state; keep disabled unless explicitly needed",
    };
  }

  return null;
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

function riskColor(risk: ArtifactApprovalPreviewModel["risk"]): string {
  return risk === "high" ? "yellow" : "cyan";
}
