import React from "react";
import { ApprovalPanel } from "../../components/ApprovalPanel.js";
import type { ApprovalStatus } from "../../state/sqlite.js";
import type { Command } from "../../types/command.js";
import { ApprovalService } from "../../services/approval/approvalService.js";

const APPROVAL_STATUSES = new Set<ApprovalStatus>(["pending", "approved", "rejected", "cancelled"]);

export const approvalCommand: Command = {
  name: "approval",
  description: "Manage persistent approval gates.",
  usage: "list [status]|policy [on|off]|request|approve|reject|cancel",
  execute(args, context) {
    const trimmed = args.trim();
    const service = new ApprovalService(context.state);
    if (trimmed === "policy" || trimmed.startsWith("policy ")) {
      const mode = trimmed.slice("policy".length).trim();
      if (mode === "on") {
        service.setManualToolApproval(true);
        return { message: "approval policy: manual tool approval on" };
      }
      if (mode === "off") {
        service.setManualToolApproval(false);
        return { message: "approval policy: manual tool approval off" };
      }
      return {
        message: `approval policy: manualToolApproval=${service.policy().manualToolApproval ? "on" : "off"}`,
      };
    }
    if (!trimmed || trimmed.startsWith("list")) {
      const [, statusArg] = trimmed.split(/\s+/);
      const status = APPROVAL_STATUSES.has(statusArg as ApprovalStatus)
        ? statusArg as ApprovalStatus
        : undefined;
      const gates = context.state.listApprovalGates({ status }, 30);
      if (gates.length === 0) return { message: "No approval gates." };
      return {
        message: formatApprovalGateList(gates),
        display: React.createElement(ApprovalPanel, { gates, projectPath: context.config.projectPath }),
      };
    }

    if (trimmed.startsWith("request ")) {
      const summary = trimmed.slice("request ".length).trim();
      if (!summary) return { message: "Usage: /approval request <summary>" };
      const runId = context.state.listRuns(1)[0]?.id;
      if (!runId) return { message: "No run exists yet; cannot create an approval gate." };
      const gateId = context.state.createApprovalGate({
        runId,
        subjectType: "run",
        subjectId: runId,
        summary,
      });
      const gate = context.state.listApprovalGates({}, 30).find((item) => item.id === gateId);
      return {
        message: "Approval requested. Use the permission panel, or run /approval approve latest when ready.",
        ...(gate
          ? {
              display: React.createElement(ApprovalPanel, {
                gates: [gate],
                projectPath: context.config.projectPath,
                title: "Approval requested",
              }),
            }
          : {}),
      };
    }

    const [verb, gateIdArg, ...rationaleParts] = trimmed.split(/\s+/);
    if (!gateIdArg) return { message: "Usage: /approval approve|reject|cancel latest [reason]" };
    if (verb === "approve" || verb === "reject" || verb === "cancel") {
      const gateId = resolveLatestApprovalGateId(service, gateIdArg);
      if (!gateId) {
        return { message: "No pending tool approval found. Use /approval list pending to inspect older gates." };
      }
      const status = verb === "approve" ? "approved" : verb === "reject" ? "rejected" : "cancelled";
      const gate = service.decide(gateId, status, rationaleParts.join(" "));
      return {
        message: `approval ${gate.status}`,
        display: React.createElement(ApprovalPanel, {
          gates: [gate],
          projectPath: context.config.projectPath,
          title: "Approval decided",
        }),
      };
    }

    return { message: "Usage: /approval list [status] | policy [on|off] | request <summary> | approve|reject|cancel latest [reason]" };
  },
};

function resolveLatestApprovalGateId(service: ApprovalService, gateId: string): string | undefined {
  if (gateId !== "latest") return gateId;
  return service
    .list("pending")
    .find((gate) => gate.subjectType !== "question" && gate.subjectType !== "plan")
    ?.id;
}

export function formatApprovalGateList(gates: Array<{
  status: ApprovalStatus;
  subjectType: string;
  summary: string;
}>): string {
  const lines = gates.map((gate, index) => {
    const title = `${index + 1}. ${gate.status} ${approvalSubjectLabel(gate.subjectType)}`;
    const next = gate.status === "pending" ? `\n   next: ${approvalNextActionHint(gate.subjectType)}` : "";
    return `${title}\n   ${compact(gate.summary, 180)}${next}`;
  });
  return lines.join("\n");
}

function approvalNextActionHint(subjectType: string): string {
  if (subjectType === "question") return "/question show latest | /question reject latest rejected";
  if (subjectType === "plan") return "/plan approve latest approved | /plan reject latest needs revision";
  return "/approval approve latest approved | /approval reject latest rejected";
}

function approvalSubjectLabel(subjectType: string): string {
  if (subjectType === "tool_action" || subjectType === "tool") return "tool request";
  if (subjectType === "plan") return "plan request";
  if (subjectType === "question") return "question";
  return "request";
}

function compact(value: string, max: number): string {
  const singleLine = value.replace(/\s+/g, " ").trim();
  return singleLine.length <= max ? singleLine : `${singleLine.slice(0, max - 3)}...`;
}
