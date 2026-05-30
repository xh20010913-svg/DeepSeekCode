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
        message: gates
          .map((gate) => `${gate.id} ${gate.status} ${gate.runId} ${gate.subjectType}:${gate.subjectId} - ${gate.summary}`)
          .join("\n"),
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
        message: `Created approval gate ${gateId}`,
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

    const [verb, gateId, ...rationaleParts] = trimmed.split(/\s+/);
    if (!gateId) return { message: "Usage: /approval approve|reject|cancel <gate-id> [reason]" };
    if (verb === "approve" || verb === "reject" || verb === "cancel") {
      const status = verb === "approve" ? "approved" : verb === "reject" ? "rejected" : "cancelled";
      const gate = service.decide(gateId, status, rationaleParts.join(" "));
      return {
        message: `${gate.id} -> ${gate.status}`,
        display: React.createElement(ApprovalPanel, {
          gates: [gate],
          projectPath: context.config.projectPath,
          title: "Approval decided",
        }),
      };
    }

    return { message: "Usage: /approval list [status] | policy [on|off] | request <summary> | approve|reject|cancel <gate-id> [reason]" };
  },
};
