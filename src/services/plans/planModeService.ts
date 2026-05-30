import fs from "node:fs";
import path from "node:path";
import type { ApprovalGateRecord, StateStore } from "../../state/sqlite.js";

const PLAN_SUBJECT = "plan";
const PLAN_SCOPE = "plan_mode";
const CURRENT_RUN_KEY = "currentRunId";

export interface PlanRecord {
  runId: string;
  path: string;
  relativePath: string;
  content: string;
  gate?: ApprovalGateRecord;
}

export class PlanModeService {
  constructor(
    private readonly projectPath: string,
    private readonly state?: StateStore,
  ) {}

  enter(runId: string, goal = ""): PlanRecord {
    const existing = this.read(runId);
    const content = existing.content || planTemplate(runId, goal);
    this.writePlan(runId, content);
    this.state?.setUiState(PLAN_SCOPE, CURRENT_RUN_KEY, runId);
    this.state?.appendEvent(runId, "plan_mode_entered", {
      plan_path: this.relativePath(runId),
      goal,
    });
    return this.read(runId);
  }

  save(runId: string, content: string): PlanRecord {
    const trimmed = content.trim();
    if (!trimmed) throw new Error("plan content is empty");
    this.writePlan(runId, `${trimmed}\n`);
    this.state?.setUiState(PLAN_SCOPE, CURRENT_RUN_KEY, runId);
    this.state?.appendEvent(runId, "plan_saved", {
      plan_path: this.relativePath(runId),
      chars: trimmed.length,
    });
    return this.read(runId);
  }

  exit(runId: string, content: string, summary = ""): PlanRecord {
    const record = this.save(runId, content);
    const gate = this.ensureApprovalGate(runId, summary || summarizePlan(content));
    this.state?.updateRunStatus(runId, "paused", `plan awaiting approval: ${gate.id}`);
    this.state?.appendEvent(runId, "plan_mode_exit_requested", {
      gate_id: gate.id,
      plan_path: record.relativePath,
    });
    return { ...record, gate };
  }

  read(runId: string): PlanRecord {
    const filePath = this.pathForRun(runId);
    const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
    return {
      runId,
      path: filePath,
      relativePath: this.relativePath(runId),
      content,
      gate: this.latestGate(runId),
    };
  }

  currentRunId(): string | undefined {
    return this.state?.getUiState<string>(PLAN_SCOPE, CURRENT_RUN_KEY);
  }

  pathForRun(runId: string): string {
    return path.join(this.projectPath, ".deepseekcode", "plans", `${safePlanName(runId)}.md`);
  }

  private relativePath(runId: string): string {
    return path.join(".deepseekcode", "plans", `${safePlanName(runId)}.md`).replace(/\\/g, "/");
  }

  private writePlan(runId: string, content: string): void {
    const filePath = this.pathForRun(runId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
  }

  private ensureApprovalGate(runId: string, summary: string): ApprovalGateRecord {
    if (!this.state) throw new Error("plan approval requires a run state store");
    const existing = this.state.listApprovalGates({
      runId,
      subjectType: PLAN_SUBJECT,
      subjectId: runId,
    }, 20);
    const reusable = existing.find((gate) => gate.status === "pending" || gate.status === "approved");
    if (reusable) return reusable;
    const gateId = this.state.createApprovalGate({
      runId,
      subjectType: PLAN_SUBJECT,
      subjectId: runId,
      summary,
    });
    return this.state.listApprovalGates({ subjectType: PLAN_SUBJECT, subjectId: runId }, 1)[0]
      ?? {
        id: gateId,
        runId,
        subjectType: PLAN_SUBJECT,
        subjectId: runId,
        status: "pending",
        summary,
        rationale: "",
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      };
  }

  private latestGate(runId: string): ApprovalGateRecord | undefined {
    return this.state?.listApprovalGates({
      runId,
      subjectType: PLAN_SUBJECT,
      subjectId: runId,
    }, 1)[0];
  }
}

export function formatPlanStatus(record: PlanRecord): string {
  const lines = [
    `plan ${record.runId}`,
    `path: ${record.relativePath}`,
    `chars: ${record.content.length}`,
  ];
  if (record.gate) {
    lines.push(`approval: ${record.gate.id} ${record.gate.status}`);
  } else {
    lines.push("approval: none");
  }
  return lines.join("\n");
}

function planTemplate(runId: string, goal: string): string {
  return [
    `# DeepSeekCode Plan ${runId}`,
    "",
    `Goal: ${goal.trim() || "(fill in the implementation goal)"}`,
    "",
    "## Understanding",
    "- ",
    "",
    "## Approach",
    "1. ",
    "",
    "## Verification",
    "- Run the focused tests/build required for this change.",
    "",
  ].join("\n");
}

function summarizePlan(content: string): string {
  const firstMeaningful = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  return compact(`Approve implementation plan: ${firstMeaningful ?? "DeepSeekCode plan"}`, 220);
}

function compact(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

function safePlanName(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]/g, "-") || "current";
}
