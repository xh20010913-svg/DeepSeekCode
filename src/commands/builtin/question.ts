import React from "react";
import { QuestionPanel } from "../../components/QuestionPanel.js";
import type { ApprovalStatus } from "../../state/sqlite.js";
import type { Command, CommandContext, CommandResult } from "../../types/command.js";
import { QuestionService, formatQuestionRecord } from "../../services/questions/questionService.js";
import { resolveRunId } from "../runSelection.js";

const QUESTION_STATUSES = new Set<ApprovalStatus>(["pending", "approved", "rejected", "cancelled"]);

export const questionCommand: Command = {
  name: "question",
  aliases: ["questions"],
  description: "Manage model-requested clarification questions.",
  usage: "list [status]|show <gate-id>|answer <gate-id> <answer>|reject <gate-id> [reason]|ask <header> :: <question> :: <label>=<description> :: ...",
  execute(args, context) {
    const trimmed = args.trim();
    const service = new QuestionService(context.config.projectPath, context.state);
    if (!trimmed || trimmed.startsWith("list")) {
      const [, statusArg] = trimmed.split(/\s+/);
      const status = QUESTION_STATUSES.has(statusArg as ApprovalStatus)
        ? statusArg as ApprovalStatus
        : undefined;
      const gates = service.list(status);
      if (gates.length === 0) return { message: "No questions." };
      const records = gates.flatMap((gate) => safeReadQuestion(service, gate.id));
      return {
        message: formatQuestionListMessage(gates, records),
        ...(records.length > 0 ? { display: questionDisplay(records, "Questions") } : {}),
      };
    }

    if (trimmed.startsWith("show ")) {
      const gateId = resolveQuestionGateId(service, trimmed.slice("show ".length).trim());
      if (!gateId) return { message: "Usage: /question show latest" };
      const record = service.read(gateId);
      return {
        message: formatQuestionRecord(record, { includeIds: false }),
        display: React.createElement(QuestionPanel, { record, title: "Question detail" }),
      };
    }

    if (trimmed.startsWith("answer ")) {
      const [gateIdArg, ...answerParts] = trimmed.slice("answer ".length).trim().split(/\s+/);
      const gateId = resolveQuestionGateId(service, gateIdArg);
      if (!gateId || answerParts.length === 0) return { message: "Usage: /question answer latest <answer>" };
      const record = service.answer(gateId, answerParts.join(" "));
      return {
        message: `question ${record.status}\nanswer: ${record.answer}`,
        display: React.createElement(QuestionPanel, { record, title: "Question answered" }),
      };
    }

    if (trimmed.startsWith("reject ")) {
      const [gateIdArg, ...reasonParts] = trimmed.slice("reject ".length).trim().split(/\s+/);
      const gateId = resolveQuestionGateId(service, gateIdArg);
      if (!gateId) return { message: "Usage: /question reject latest [reason]" };
      const record = service.reject(gateId, reasonParts.join(" ") || "rejected");
      return {
        message: `question ${record.status}`,
        display: React.createElement(QuestionPanel, { record, title: "Question rejected" }),
      };
    }

    if (trimmed.startsWith("ask ")) {
      return askQuestion(trimmed.slice("ask ".length), context, service);
    }

    return { message: "Usage: /question list [status] | show latest | answer latest <answer> | reject latest [reason] | ask <header> :: <question> :: <label>=<description> :: ..." };
  },
};

function resolveQuestionGateId(service: QuestionService, gateId: string | undefined): string | undefined {
  if (gateId && gateId !== "latest") return gateId;
  return service.list("pending")[0]?.id;
}

function askQuestion(
  input: string,
  context: CommandContext,
  service: QuestionService,
): CommandResult {
  const parts = input.split("::").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 4) {
    return {
      message: "Usage: /question ask <header> :: <question> :: <label>=<description> :: <label>=<description>",
    };
  }
  const [runSelectorOrHeader, maybeHeaderOrQuestion, maybeQuestionOrOption, ...remaining] = parts;
  const explicitRun = isRunSelector(runSelectorOrHeader);
  const runId = explicitRun
    ? resolveRunId(runSelectorOrHeader, context)
    : context.state.listRuns(1)[0]?.id
      ?? context.state.createRun({
        projectPath: context.config.projectPath,
        model: context.config.model,
        message: "manual question",
      });
  if (!runId) return { message: "No run exists yet; cannot ask a question." };
  const header = explicitRun ? maybeHeaderOrQuestion : runSelectorOrHeader;
  const question = explicitRun ? maybeQuestionOrOption : maybeHeaderOrQuestion;
  const optionParts = explicitRun ? remaining : [maybeQuestionOrOption, ...remaining];
  const options = optionParts.map((part) => {
    const [label, ...descriptionParts] = part.split("=");
    return {
      label: label?.trim() ?? "",
      description: descriptionParts.join("=").trim(),
    };
  });
  const record = service.request(runId, [{ header, question, options }]);
  return {
    message: formatQuestionRecord(record, { includeIds: false }),
    display: React.createElement(QuestionPanel, { record, title: "Question requested" }),
  };
}

function isRunSelector(value: string): boolean {
  return value === "attached" || value === "current" || value === "latest" || value.startsWith("run_");
}

function safeReadQuestion(service: QuestionService, gateId: string) {
  try {
    return [service.read(gateId)];
  } catch {
    return [];
  }
}

function formatQuestionListMessage(
  gates: ReturnType<QuestionService["list"]>,
  records: ReturnType<QuestionService["read"]>[],
): string {
  if (records.length > 0) {
    return records
      .map((record, index) => `${index + 1}. ${formatQuestionRecord(record, { includeIds: false })}`)
      .join("\n\n");
  }
  return gates
    .map((gate, index) => `${index + 1}. ${gate.status} question\n   ${gate.summary}`)
    .join("\n");
}

function questionDisplay(
  records: ReturnType<QuestionService["read"]>[],
  title: string,
): React.ReactElement {
  return React.createElement(
    React.Fragment,
    null,
    ...records.map((record) => React.createElement(QuestionPanel, {
      key: record.gateId,
      record,
      title,
    })),
  );
}
