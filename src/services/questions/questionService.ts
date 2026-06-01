import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { ApprovalGateRecord, StateStore } from "../../state/sqlite.js";

export interface QuestionOption {
  label: string;
  description: string;
  preview?: string;
}

export interface UserQuestion {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect?: boolean;
}

export interface QuestionRecord {
  gateId: string;
  runId: string;
  status: ApprovalGateRecord["status"];
  questions: UserQuestion[];
  answer?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

const QUESTION_SUBJECT = "question";

export class QuestionService {
  constructor(
    private readonly projectPath: string,
    private readonly state: StateStore,
  ) {}

  request(runId: string, questions: UserQuestion[]): QuestionRecord {
    const normalized = normalizeQuestions(questions);
    const subjectId = questionSubjectId(normalized);
    const existing = this.state.listApprovalGates({
      runId,
      subjectType: QUESTION_SUBJECT,
      subjectId,
    }, 20).find((gate) => gate.status === "pending");
    const gate = existing ?? this.createGate(runId, subjectId, normalized);
    const record = this.writeRecord({
      gateId: gate.id,
      runId,
      status: gate.status,
      questions: normalized,
      createdAtMs: gate.createdAtMs,
      updatedAtMs: Date.now(),
    });
    this.state.updateRunStatus(runId, "paused", "question awaiting answer");
    this.state.appendEvent(runId, "question_requested", {
      gate_id: gate.id,
      question_count: normalized.length,
      subject_id: subjectId,
    });
    return record;
  }

  answer(gateId: string, answer: string): QuestionRecord {
    const trimmed = answer.trim();
    if (!trimmed) throw new Error("answer is empty");
    const gate = this.state.decideApprovalGate(gateId, "approved", trimmed);
    const record = this.read(gateId);
    const updated = this.writeRecord({
      ...record,
      status: gate.status,
      answer: trimmed,
      updatedAtMs: Date.now(),
    });
    this.state.appendEvent(gate.runId, "question_answered", {
      gate_id: gateId,
      answer_chars: trimmed.length,
    });
    return updated;
  }

  reject(gateId: string, reason: string): QuestionRecord {
    const gate = this.state.decideApprovalGate(gateId, "rejected", reason);
    const record = this.read(gateId);
    return this.writeRecord({
      ...record,
      status: gate.status,
      answer: reason,
      updatedAtMs: Date.now(),
    });
  }

  read(gateId: string): QuestionRecord {
    const filePath = this.pathForGate(gateId);
    if (!fs.existsSync(filePath)) throw new Error(`question record not found: ${gateId}`);
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as QuestionRecord;
  }

  list(status?: ApprovalGateRecord["status"]): ApprovalGateRecord[] {
    return this.state.listApprovalGates({
      subjectType: QUESTION_SUBJECT,
      status,
    }, 50);
  }

  pathForGate(gateId: string): string {
    return path.join(this.projectPath, ".deepseekcode", "questions", `${safeName(gateId)}.json`);
  }

  private createGate(runId: string, subjectId: string, questions: UserQuestion[]): ApprovalGateRecord {
    const gateId = this.state.createApprovalGate({
      runId,
      subjectType: QUESTION_SUBJECT,
      subjectId,
      summary: summarizeQuestions(questions),
    });
    return this.state.listApprovalGates({ subjectType: QUESTION_SUBJECT, subjectId }, 1)[0]
      ?? {
        id: gateId,
        runId,
        subjectType: QUESTION_SUBJECT,
        subjectId,
        status: "pending",
        summary: summarizeQuestions(questions),
        rationale: "",
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      };
  }

  private writeRecord(record: QuestionRecord): QuestionRecord {
    const filePath = this.pathForGate(record.gateId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return record;
  }
}

export function formatQuestionRecord(
  record: QuestionRecord,
  options: { includeIds?: boolean } = {},
): string {
  const includeIds = options.includeIds ?? true;
  const lines = [
    includeIds
      ? `${record.gateId} ${record.status} run=${record.runId}`
      : `${record.status} question`,
    ...record.questions.flatMap((question, index) => [
      `${index + 1}. ${question.header}: ${question.question}`,
      ...question.options.map((option) => `   - ${option.label}: ${option.description}`),
    ]),
  ];
  if (record.answer) lines.push(`answer: ${record.answer}`);
  return lines.join("\n");
}

function normalizeQuestions(questions: UserQuestion[]): UserQuestion[] {
  if (questions.length < 1 || questions.length > 4) throw new Error("AskUserQuestion requires 1-4 questions");
  const seenQuestions = new Set<string>();
  return questions.map((question, index) => {
    const text = question.question.trim();
    const header = question.header.trim();
    if (!text) throw new Error(`question ${index + 1} text is empty`);
    if (!header) throw new Error(`question ${index + 1} header is empty`);
    if (seenQuestions.has(text)) throw new Error(`duplicate question: ${text}`);
    seenQuestions.add(text);
    if (question.options.length < 2 || question.options.length > 4) {
      throw new Error(`question ${index + 1} must have 2-4 options`);
    }
    const labels = new Set<string>();
    const options = question.options.map((option) => {
      const label = option.label.trim();
      const description = option.description.trim();
      if (!label || !description) throw new Error(`question ${index + 1} option is incomplete`);
      if (labels.has(label)) throw new Error(`duplicate option label: ${label}`);
      labels.add(label);
      return {
        label,
        description,
        preview: option.preview?.trim() || undefined,
      };
    });
    return {
      question: text,
      header: header.slice(0, 12),
      options,
      multiSelect: Boolean(question.multiSelect),
    };
  });
}

function summarizeQuestions(questions: UserQuestion[]): string {
  return compact(`Question for user: ${questions.map((question) => `${question.header}: ${question.question}`).join(" | ")}`, 220);
}

function questionSubjectId(questions: UserQuestion[]): string {
  return `question_${createHash("sha256").update(JSON.stringify(questions)).digest("hex").slice(0, 24)}`;
}

function compact(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-") || "question";
}
