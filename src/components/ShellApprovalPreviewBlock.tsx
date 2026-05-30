import React from "react";
import { Box, Text } from "ink";
import { parseActionSummary } from "./ActionSummaryBlock.js";

export interface ShellApprovalPreviewModel {
  action: "run_command" | "ssh_run";
  title: string;
  command: string;
  targetLabel: string;
  target: string;
  risk: "low" | "medium" | "high";
  allowScope: string;
  note: string;
}

export function ShellApprovalPreviewBlock(props: {
  summary: string;
}): React.ReactElement | null {
  const model = shellApprovalPreviewModel(props.summary);
  if (!model) return null;

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={riskColor(model.risk)}>{model.title}</Text>
        {" "}
        <Text color="gray">{model.risk}</Text>
      </Text>
      <ShellPreviewRow label="command" value={model.command} color="gray" />
      <ShellPreviewRow label={model.targetLabel} value={model.target} />
      <ShellPreviewRow label="scope" value={model.allowScope} />
      <ShellPreviewRow label="note" value={model.note} color="gray" />
    </Box>
  );
}

export function shellApprovalPreviewModel(summary: string): ShellApprovalPreviewModel | null {
  const parsed = parseActionSummary(summary);
  if (!parsed || (parsed.action !== "run_command" && parsed.action !== "ssh_run")) return null;
  const fields = Object.fromEntries(parsed.fields.map((field) => [field.key, field.value]));
  const command = fields.command || "";
  const risk = classifyShellRisk(command);

  if (parsed.action === "ssh_run") {
    return {
      action: "ssh_run",
      title: "SSH command",
      command: command || "(unknown)",
      targetLabel: "profile",
      target: fields.profile || "(unknown)",
      risk: risk === "low" ? "medium" : risk,
      allowScope: shellAllowScope(command),
      note: "remote shell execution needs explicit approval",
    };
  }

  return {
    action: "run_command",
    title: "Shell command",
    command: command || "(unknown)",
    targetLabel: "cwd",
    target: fields.cwd || ".",
    risk,
    allowScope: shellAllowScope(command),
    note: risk === "high" ? "review carefully before approving" : "approve only if this exact command is expected",
  };
}

function classifyShellRisk(command: string): ShellApprovalPreviewModel["risk"] {
  const normalized = command.trim();
  if (!normalized) return "medium";
  if (/[;&|]\s*(rm|del|rmdir|remove-item|git\s+clean|git\s+reset)\b/i.test(normalized)) return "high";
  if (/^(rm|del|rmdir|remove-item|git\s+clean|git\s+reset)\b/i.test(normalized)) return "high";
  if (/(^|\s)(--force|-rf|-fr|\/s)(\s|$)/i.test(normalized)) return "high";
  if (/(^|\s)>\s*\S+/.test(normalized)) return "high";
  if (/^(git\s+(status|diff|log|show|branch)|pwd|dir|ls|get-childitem|node\s+--version)\b/i.test(normalized)) return "low";
  if (/^(npm(?:\.cmd)?|pnpm|yarn)\s+(run\s+)?(build|test|smoke|typecheck|lint)\b/i.test(normalized)) return "medium";
  return "medium";
}

function shellAllowScope(command: string): string {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "exact command only";
  const first = tokens[0] ?? "";
  const second = tokens[1] ?? "";
  if (!second) return `${first}:*`;
  if (/^(npm(?:\.cmd)?|pnpm|yarn)$/i.test(first) && second === "run" && tokens[2]) {
    return `${first} run ${tokens[2]}:*`;
  }
  return `${first} ${second}:*`;
}

function riskColor(risk: ShellApprovalPreviewModel["risk"]): string {
  if (risk === "high") return "yellow";
  if (risk === "medium") return "cyan";
  return "green";
}

function ShellPreviewRow(props: {
  label: string;
  value: string;
  color?: string;
}): React.ReactElement {
  return (
    <Box flexDirection="row">
      <Text color="gray">{props.label.padEnd(9)} </Text>
      <Text color={props.color ?? "gray"}>{props.value || "-"}</Text>
    </Box>
  );
}
