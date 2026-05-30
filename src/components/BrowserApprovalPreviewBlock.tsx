import React from "react";
import { Box, Text } from "ink";
import { parseActionSummary } from "./ActionSummaryBlock.js";
import { truncateCells } from "./design/textLayout.js";

export interface BrowserApprovalPreviewModel {
  action: string;
  title: string;
  url: string;
  targetLabel: string;
  target: string;
  risk: "low" | "medium" | "high";
  note: string;
}

export function BrowserApprovalPreviewBlock(props: {
  summary: string;
  width?: number;
}): React.ReactElement | null {
  const model = browserApprovalPreviewModel(props.summary);
  if (!model) return null;
  const width = props.width ?? 96;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text color={riskColor(model.risk)}>{model.title}</Text>
        {" "}
        <Text color="gray">{model.risk}</Text>
      </Text>
      <PreviewRow label="url" value={model.url} width={width} />
      <PreviewRow label={model.targetLabel} value={model.target} width={width} />
      <PreviewRow label="note" value={model.note} width={width} color="gray" />
    </Box>
  );
}

export function browserApprovalPreviewModel(summary: string): BrowserApprovalPreviewModel | null {
  const parsed = parseActionSummary(summary);
  if (!parsed || !parsed.action.startsWith("browser_")) return null;
  const fields = Object.fromEntries(parsed.fields.map((field) => [field.key, field.value]));
  const url = fields.url || "(unknown url)";

  if (parsed.action === "browser_screenshot") {
    return {
      action: parsed.action,
      title: "Browser screenshot",
      url,
      targetLabel: "path",
      target: fields.path || "(unknown path)",
      risk: "medium",
      note: fields.fullPage === "true" ? "captures a full-page screenshot artifact" : "captures the current viewport",
    };
  }

  if (parsed.action === "browser_click") {
    return {
      action: parsed.action,
      title: "Browser click",
      url,
      targetLabel: "selector",
      target: fields.selector || "(unknown selector)",
      risk: "high",
      note: "may trigger navigation, form actions, purchases, or other state changes",
    };
  }

  if (parsed.action === "browser_type") {
    return {
      action: parsed.action,
      title: "Browser typing",
      url,
      targetLabel: "selector",
      target: fields.selector || "(unknown selector)",
      risk: "high",
      note: `typed text is redacted from the gate summary; ${fields.textChars || "0"} chars`,
    };
  }

  if (parsed.action === "browser_session_start") {
    return {
      action: parsed.action,
      title: "Browser session",
      url,
      targetLabel: "visible",
      target: fields.visible || "true",
      risk: "medium",
      note: "opens or attaches a browser session",
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

function riskColor(risk: BrowserApprovalPreviewModel["risk"]): string {
  if (risk === "high") return "yellow";
  if (risk === "low") return "green";
  return "cyan";
}
