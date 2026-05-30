import React from "react";
import type { ValidationStatus } from "../../state/sqlite.js";
import type { Command } from "../../types/command.js";
import { OperationPanel, validationPanelModel } from "../../components/OperationPanel.js";
import { ValidationService } from "../../services/validation/validationService.js";
import { resolveRunId } from "../runSelection.js";

const STATUSES = new Set<ValidationStatus>(["pending", "passed", "failed"]);

export const validationCommand: Command = {
  name: "validation",
  description: "List artifact validation gates.",
  usage: "[run-id|attached] [pending|passed|failed]",
  execute(args, context) {
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
        .map((gate) => `${gate.id} ${gate.status} ${gate.runId} ${gate.subjectType}:${gate.subjectId} - ${gate.summary}`)
        .join("\n"),
      display,
    };
  },
};
