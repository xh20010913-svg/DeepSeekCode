import fs from "node:fs";
import path from "node:path";
import type { ApprovalGateRecord } from "../../state/sqlite.js";
import type { QuestionRecord } from "../questions/questionService.js";

export interface GateDecisionOption {
  label: string;
  command: string;
  description: string;
  shortcut: string;
  tone: "allow" | "reject" | "inspect" | "neutral";
}

export function gateDecisionOptions(input: {
  gate: ApprovalGateRecord;
  projectPath?: string;
}): GateDecisionOption[] {
  if (input.gate.status !== "pending") return [];
  if (input.gate.subjectType === "question") {
    return questionDecisionOptions(input.gate, input.projectPath);
  }
  if (input.gate.subjectType === "plan") {
    return [
      option("Approve", "/plan approve latest approved", "continue with this plan", "Enter / Y", "allow"),
      option("Reject", "/plan reject latest needs revision", "ask for a different plan", "N", "reject"),
      option("Cancel", "/plan cancel latest cancelled", "close this request", "Esc", "neutral"),
    ];
  }
  if (isShellGate(input.gate.summary)) {
    return [
      option("Allow once", "/approval approve latest approved", "run this exact shell action once", "Enter / Y", "allow"),
      option("Allow session", "/approval approve latest shell-session", "enable shell for this TUI session", "S", "allow"),
      option("Reject", "/approval reject latest rejected", "block and send feedback", "N", "reject"),
      option("Cancel", "/approval cancel latest cancelled", "close without approving", "Esc", "neutral"),
    ];
  }
  return [
    option("Allow once", "/approval approve latest approved", "continue this exact action", "Enter / Y", "allow"),
    option("Reject", "/approval reject latest rejected", "block and send feedback", "N", "reject"),
    option("Cancel", "/approval cancel latest cancelled", "close without approving", "Esc", "neutral"),
  ];
}

function isShellGate(summary: string): boolean {
  return /^(run_command|ssh_run|ssh_read_file|ssh_write_file|mcp_call)\b/.test(summary.trim());
}

function questionDecisionOptions(
  gate: ApprovalGateRecord,
  projectPath: string | undefined,
): GateDecisionOption[] {
  const record = projectPath ? readQuestionRecord(projectPath, gate.id) : null;
  const questions = record?.questions ?? [];
  if (questions.length === 1 && questions[0]?.options.length) {
    const choices = questions[0].options.map((choice, index) =>
      option(
        choice.label,
        `/question answer latest ${choice.label}`,
        choice.description,
        index === 0 ? "Enter" : String(index + 1),
        "allow",
      ));
    return [
      ...choices,
      option("Reject", "/question reject latest rejected", "ask DeepSeekCode to revise the question", "Esc", "reject"),
    ];
  }
  return [
    option("Show", "/question show latest", "inspect the full question", "Enter", "inspect"),
    option("Reject", "/question reject latest rejected", "ask DeepSeekCode to revise the question", "Esc", "reject"),
  ];
}

function option(
  label: string,
  command: string,
  description: string,
  shortcut: string,
  tone: GateDecisionOption["tone"],
): GateDecisionOption {
  return { label, command, description, shortcut, tone };
}

function readQuestionRecord(projectPath: string, gateId: string): QuestionRecord | null {
  const filePath = path.join(projectPath, ".deepseekcode", "questions", `${safeName(gateId)}.json`);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as QuestionRecord;
  } catch {
    return null;
  }
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-") || "question";
}
