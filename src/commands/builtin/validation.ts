import React from "react";
import type { ValidationStatus } from "../../state/sqlite.js";
import type { Command, CommandContext } from "../../types/command.js";
import { OperationPanel, validationPanelModel } from "../../components/OperationPanel.js";
import { ValidationService } from "../../services/validation/validationService.js";
import { resolveRunId } from "../runSelection.js";

const STATUSES = new Set<ValidationStatus>(["pending", "passed", "failed"]);

export const validationCommand: Command = {
  name: "validation",
  aliases: ["verify"],
  description: "List artifact validation gates.",
  usage: "[explain [run-id|attached]|run-id|attached] [pending|passed|failed]",
  execute(args, context) {
    if (args.trim() === "explain" || args.trim().startsWith("explain ")) {
      const selector = args.trim().startsWith("explain ") ? args.trim().slice("explain ".length).trim() : "";
      const runId = selector ? resolveRunId(selector, context) : context.state.listRuns(1)[0]?.id;
      if (!runId) return { message: "没有可解释的 run。" };
      return { message: formatValidationExplain(runId, context) };
    }
    const parts = args.trim().split(/\s+/).filter(Boolean);
    const statusArg = parts.find((part) => STATUSES.has(part as ValidationStatus));
    const status = statusArg as ValidationStatus | undefined;
    const runArg = parts.find((part) => part !== statusArg) || "";
    const runId = runArg ? resolveRunId(runArg, context) : undefined;
    const gates = new ValidationService(context.state).list(runId, status);
    const scope = [runId ?? "all", status ?? "any"].join(" ");
    const display = React.createElement(OperationPanel, { model: validationPanelModel(gates, scope) });
    if (gates.length === 0) return { message: "No validation gates.", display };
    return {
      message: gates
        .map((gate, index) => `${index + 1}. ${gate.status} validation\n   target: ${gate.subjectType}:${gate.subjectId}\n   ${gate.summary}`)
        .join("\n"),
      display,
    };
  },
};

function formatValidationExplain(runId: string, context: CommandContext): string {
  const gates = new ValidationService(context.state).list(runId);
  const events = context.state.listEvents(runId, 120);
  const evidence = events.filter((event) => event.kind === "agent_kernel_evidence");
  const failures = gates.filter((gate) => gate.status === "failed");
  const passed = gates.filter((gate) => gate.status === "passed");
  const pending = gates.filter((gate) => gate.status === "pending");
  return [
    "Verify explain",
    `run: ${runId}`,
    `validation: passed=${passed.length} failed=${failures.length} pending=${pending.length}`,
    `evidence_events: ${evidence.length}`,
    "",
    "验收结论:",
    failures.length
      ? "当前不能通过：存在失败的 validation gate，必须先修复对应产物或命令证据。"
      : pending.length
        ? "当前不能最终完成：仍有待验收 gate。"
        : passed.length
          ? "当前 validation gate 均已通过；仍需最终回答列出真实 evidence。"
          : "没有 validation gate；对于 PDF/网站/Office/MCP 等产物任务，这通常意味着还缺少真实验收。",
    "",
    "最近 validation gate:",
    ...(gates.slice(0, 8).map((gate, index) =>
      `${index + 1}. ${gate.status} ${gate.subjectType}:${gate.subjectId} ${gate.summary}`,
    ) || []),
    gates.length ? "" : "- 无",
    "",
    "最近 evidence:",
    ...(evidence.slice(0, 8).map((event, index) => {
      const payload = event.payload as Record<string, unknown>;
      return `${index + 1}. ${String(payload.kind ?? "unknown")} ${String(payload.summary ?? payload.path ?? payload.url ?? "")}`;
    }) || []),
    evidence.length ? "" : "- 无",
  ].join("\n");
}
