import React from "react";
import { PlanPanel } from "../../components/PlanPanel.js";
import type { Command, CommandContext } from "../../types/command.js";
import { ApprovalService } from "../../services/approval/approvalService.js";
import { PlanModeService, formatPlanReference, formatPlanStatus } from "../../services/plans/planModeService.js";
import { resolveRunId } from "../runSelection.js";

export const planCommand: Command = {
  name: "plan",
  description: "Manage DeepSeekCode plan-mode drafts and plan approval gates.",
  usage: "[status|start|show|exit|path|approve|reject|cancel] [run-id|attached|current|latest] [text]",
  execute(args, context) {
    const [verb = "status", ...rest] = args.trim().split(/\s+/).filter(Boolean);
    const service = new PlanModeService(context.config.projectPath, context.state);
    if (verb === "approve" || verb === "reject" || verb === "cancel") {
      const [gateIdArg, ...rationaleParts] = rest;
      const gateId = resolvePlanGateId(context, gateIdArg);
      if (!gateId) return { message: "Usage: /plan approve|reject|cancel latest [reason]" };
      const status = verb === "approve" ? "approved" : verb === "reject" ? "rejected" : "cancelled";
      const gate = new ApprovalService(context.state).decide(gateId, status, rationaleParts.join(" "));
      const record = service.read(gate.runId);
      return {
        message: `plan ${gate.status}`,
        display: React.createElement(PlanPanel, { record, title: "Plan decided" }),
      };
    }

    if (verb === "start") {
      const { runId, text } = resolvePlanArgs(rest, context, true);
      if (!runId) return { message: "No run exists yet; cannot enter plan mode." };
      const record = service.enter(runId, text);
      return {
        message: [
          "entered plan mode",
          `draft: ${formatPlanReference(record.relativePath)}`,
          "write the plan, then run /plan exit when it is ready for approval",
        ].join("\n"),
        display: React.createElement(PlanPanel, { record, title: "Plan draft" }),
      };
    }

    if (verb === "show") {
      const { runId } = resolvePlanArgs(rest, context, false);
      if (!runId) return { message: "No run records yet." };
      const record = service.read(runId);
      return {
        message: record.content || "No plan draft yet.",
        display: React.createElement(PlanPanel, { record, title: "Plan detail" }),
      };
    }

    if (verb === "exit") {
      const { runId, text } = resolvePlanArgs(rest, context, false);
      if (!runId) return { message: "No run records yet." };
      const existing = service.read(runId);
      const plan = text.trim() || existing.content.trim();
      if (!plan) return { message: "Usage: /plan exit [run-id|attached|current|latest] <plan text>" };
      const record = service.exit(runId, plan);
      return {
        message: [
          "plan awaiting approval",
          `draft: ${formatPlanReference(record.relativePath)}`,
          "approve with /plan approve latest <reason>",
        ].join("\n"),
        display: React.createElement(PlanPanel, { record, title: "Plan awaiting approval" }),
      };
    }

    if (verb === "path") {
      const { runId } = resolvePlanArgs(rest, context, false);
      if (!runId) return { message: "No run records yet." };
      return { message: service.pathForRun(runId) };
    }

    if (verb === "status" || !verb) {
      const { runId } = resolvePlanArgs(rest, context, false);
      if (!runId) return { message: "No run records yet." };
      const record = service.read(runId);
      return {
        message: formatPlanStatus(record),
        display: React.createElement(PlanPanel, { record, title: "Plan status" }),
      };
    }

    return { message: "Usage: /plan status|start|show|exit|path|approve|reject|cancel" };
  },
};

function resolvePlanArgs(
  parts: string[],
  context: CommandContext,
  createIfMissing: boolean,
): { runId?: string; text: string } {
  const first = parts[0];
  if (first && (first === "attached" || first === "current" || first === "latest" || first.startsWith("run_"))) {
    return {
      runId: first === "latest" ? context.state.listRuns(1)[0]?.id : resolveRunId(first, context),
      text: parts.slice(1).join(" "),
    };
  }
  const existing = new PlanModeService(context.config.projectPath, context.state).currentRunId()
    ?? context.state.listRuns(1)[0]?.id;
  if (existing || !createIfMissing) return { runId: existing, text: parts.join(" ") };
  const runId = context.state.createRun({
    projectPath: context.config.projectPath,
    model: context.config.model,
    message: parts.join(" ") || "manual plan",
  });
  return { runId, text: parts.join(" ") };
}

function resolvePlanGateId(context: CommandContext, gateId: string | undefined): string | undefined {
  if (gateId && gateId !== "latest") return gateId;
  return new ApprovalService(context.state)
    .list("pending")
    .find((gate) => gate.subjectType === "plan")
    ?.id;
}
