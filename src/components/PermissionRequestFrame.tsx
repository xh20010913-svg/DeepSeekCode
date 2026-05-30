import React from "react";
import { Box, Text } from "ink";
import { parseActionSummary } from "./ActionSummaryBlock.js";
import { Dialog } from "./design/Dialog.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";
import type { ApprovalGateRecord } from "../state/sqlite.js";

export interface PermissionRequestFrameModel {
  title: string;
  subtitle: string;
  scope: string;
  risk: "low" | "medium" | "high";
  tone: TerminalTone;
  titleColor: string;
  statusLabel: string;
}

export function PermissionRequestFrame(props: {
  gate: ApprovalGateRecord;
  width: number;
  children: React.ReactNode;
}): React.ReactElement {
  const model = permissionRequestFrameModel(props.gate);
  const subtitle = truncateCells(model.subtitle, Math.max(24, props.width - 22));
  const scope = truncateCells(model.scope, Math.max(24, props.width - 16));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Dialog
        width={props.width}
        title={<Text bold color={model.titleColor}>{model.title}</Text>}
        subtitle={subtitle}
        tone={model.tone}
        paneTitle="permission request"
        statusLabel={model.statusLabel}
        meta={props.gate.id}
        inputGuide={`/approval approve ${props.gate.id} | /approval reject ${props.gate.id}`}
      >
        <Box flexDirection="row">
          <Text color="gray">scope   </Text>
          <Text color="gray">{scope}</Text>
        </Box>
        <Box flexDirection="row">
          <Text color="gray">risk    </Text>
          <Text color={titleColorForRisk(model.risk)}>{model.risk}</Text>
        </Box>
        {props.children}
      </Dialog>
    </Box>
  );
}

export function permissionRequestFrameModel(gate: ApprovalGateRecord): PermissionRequestFrameModel {
  const parsed = parseActionSummary(gate.summary);
  const fields = Object.fromEntries(parsed?.fields.map((field) => [field.key, field.value]) ?? []);
  const action = parsed?.action ?? gate.subjectType;
  const base = baseModelForGate(gate, action, fields);
  return {
    ...base,
    tone: toneForGate(gate.status, base.risk),
    titleColor: titleColorForRisk(base.risk),
    statusLabel: gate.status,
  };
}

function baseModelForGate(
  gate: ApprovalGateRecord,
  action: string,
  fields: Record<string, string>,
): { title: string; subtitle: string; scope: string; risk: "low" | "medium" | "high" } {
  if (gate.subjectType === "question") {
    return {
      title: "DeepSeekCode needs your answer",
      subtitle: compact(gate.summary.replace(/^Question for user:\s*/i, "")),
      scope: "answer one pending question gate",
      risk: "medium",
    };
  }

  if (gate.subjectType === "plan") {
    return {
      title: "DeepSeekCode wants to enter plan mode",
      subtitle: compact(gate.summary),
      scope: "approve or reject this plan draft",
      risk: "medium",
    };
  }

  if (action === "run_command") {
    const command = fields.command || "(unknown command)";
    return {
      title: "DeepSeekCode wants to run a command",
      subtitle: command,
      scope: fields.cwd ? `cwd ${fields.cwd}` : "local shell",
      risk: commandRisk(command),
    };
  }

  if (action === "ssh_run") {
    const command = fields.command || "(unknown command)";
    return {
      title: "DeepSeekCode wants to run SSH",
      subtitle: command,
      scope: fields.profile ? `profile ${fields.profile}` : "remote shell",
      risk: "high",
    };
  }

  if (action === "ssh_write_file") {
    return {
      title: fields.overwrite === "true"
        ? "DeepSeekCode wants to overwrite a remote file"
        : "DeepSeekCode wants to write a remote file",
      subtitle: fields.path || "(unknown path)",
      scope: fields.profile ? `profile ${fields.profile}` : "remote file",
      risk: fields.overwrite === "true" ? "high" : "medium",
    };
  }

  if (action === "write_file") {
    const overwrite = fields.overwrite === "true";
    return {
      title: overwrite ? "DeepSeekCode wants to overwrite a file" : "DeepSeekCode wants to create a file",
      subtitle: fields.path || "(unknown path)",
      scope: overwrite ? "replace file contents" : "create new file",
      risk: overwrite ? "high" : "medium",
    };
  }

  if (action === "apply_patch") {
    return {
      title: "DeepSeekCode wants to apply a patch",
      subtitle: fields.path || "(unknown path)",
      scope: fields.edits ? `${fields.edits} search/replace edit(s)` : "file patch",
      risk: "high",
    };
  }

  if (action.startsWith("browser_") || action === "browser_open") {
    return {
      title: "DeepSeekCode wants to use the browser",
      subtitle: fields.url || gate.summary,
      scope: "browser action",
      risk: "medium",
    };
  }

  if (action === "mcp_call") {
    return {
      title: "DeepSeekCode wants to call MCP",
      subtitle: fields.tool || gate.summary,
      scope: fields.server ? `server ${fields.server}` : "mcp tool",
      risk: "medium",
    };
  }

  if (action === "create_docx" || action === "create_pdf") {
    return {
      title: action === "create_docx"
        ? "DeepSeekCode wants to create a DOCX"
        : "DeepSeekCode wants to create a PDF",
      subtitle: fields.path || "(unknown path)",
      scope: `${fields.markdownChars || "0"} markdown chars`,
      risk: "medium",
    };
  }

  if (action === "computer_use") {
    return {
      title: "DeepSeekCode wants computer control",
      subtitle: `${fields.instructionChars || "0"} instruction chars`,
      scope: "local desktop automation",
      risk: "high",
    };
  }

  if (action === "invoke_agent") {
    return {
      title: "DeepSeekCode wants to invoke an agent",
      subtitle: fields.agent || gate.summary,
      scope: "local subagent",
      risk: "medium",
    };
  }

  return {
    title: "DeepSeekCode needs permission",
    subtitle: compact(gate.summary),
    scope: action || gate.subjectType,
    risk: "medium",
  };
}

function toneForGate(status: ApprovalGateRecord["status"], risk: "low" | "medium" | "high"): TerminalTone {
  if (status === "approved") return "success";
  if (status === "rejected") return "error";
  if (status === "cancelled") return "muted";
  if (risk === "high") return "warning";
  return "brand";
}

function titleColorForRisk(risk: "low" | "medium" | "high"): string {
  if (risk === "high") return "yellow";
  if (risk === "low") return "green";
  return "cyan";
}

function commandRisk(command: string): "low" | "medium" | "high" {
  if (/(^|\s)(del|erase|rd|rmdir|rm|remove-item|git\s+clean|git\s+reset)(\s|$)/i.test(command)) return "high";
  if (/(^|\s)(--force|-rf|-fr|\/s)(\s|$)/i.test(command)) return "high";
  if (/>\s*\S+|>>\s*\S+/.test(command)) return "high";
  if (/^(git\s+status|git\s+diff|pwd|dir|ls|node\s+--version|npm\.cmd\s+--version)\b/i.test(command.trim())) return "low";
  return "medium";
}

function compact(value: string): string {
  const singleLine = value.replace(/\s+/g, " ").trim();
  return singleLine.length > 220 ? `${singleLine.slice(0, 217)}...` : singleLine;
}
