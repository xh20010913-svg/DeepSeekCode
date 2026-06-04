import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { ActionExecutionReport, ActionResult, ArtifactKind } from "../protocol/actions.js";
import type { UsageSnapshot } from "../protocol/provider.js";
import { getRunEventBus } from "../services/runs/runEventBus.js";

export type RunStatus = "running" | "succeeded" | "failed" | "paused" | "cancelled";
export type TaskStatus = "queued" | "running" | "succeeded" | "failed" | "paused" | "cancelled";
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface RunRecord {
  id: string;
  projectPath: string;
  model: string;
  status: RunStatus;
  message: string;
  createdAtMs: number;
  updatedAtMs: number;
  actionCount: number;
  artifactCount: number;
  eventCount: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
}

export interface EventRecord {
  id: number;
  runId: string | null;
  kind: string;
  payload: unknown;
  createdAtMs: number;
}

export interface TaskRecord {
  id: string;
  runId: string;
  parentTaskId: string | null;
  agent: string;
  title: string;
  status: TaskStatus;
  detail: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface TaskDependencyRecord {
  taskId: string;
  dependsOnTaskId: string;
  createdAtMs: number;
}

export interface JobRecord {
  id: string;
  runId: string | null;
  kind: string;
  status: JobStatus;
  payload: unknown;
  detail: string;
  attempts: number;
  maxAttempts: number;
  lockedBy: string | null;
  lockedAtMs: number | null;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface CheckpointRecord {
  id: string;
  runId: string;
  scope: string;
  snapshot: unknown;
  createdAtMs: number;
}

export interface ContextSnapshotRecord {
  id: string;
  runId: string;
  kind: string;
  content: unknown;
  createdAtMs: number;
}

export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";
export type ValidationStatus = "pending" | "passed" | "failed";

export interface ApprovalGateRecord {
  id: string;
  runId: string;
  subjectType: string;
  subjectId: string;
  status: ApprovalStatus;
  summary: string;
  rationale: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ValidationGateRecord {
  id: string;
  runId: string;
  subjectType: string;
  subjectId: string;
  status: ValidationStatus;
  summary: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  snapshots: number;
}

export class StateStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  createRun(input: { projectPath: string; model: string; message: string; status?: RunStatus }): string {
    const id = `run_${randomUUID()}`;
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO runs (id, project_path, model, status, message, created_at_ms, updated_at_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.projectPath, input.model, input.status ?? "running", input.message, now, now);
    this.appendEvent(id, "run_created", {
      project_path: input.projectPath,
      model: input.model,
      message: input.message,
    });
    return id;
  }

  updateRunStatus(runId: string, status: RunStatus, message = ""): void {
    const now = Date.now();
    this.db.prepare(`
      UPDATE runs SET status = ?, message = COALESCE(NULLIF(?, ''), message), updated_at_ms = ? WHERE id = ?
    `).run(status, message, now, runId);
    this.appendEvent(runId, "run_status_updated", { status, message });
  }

  appendEvent(runId: string | null, kind: string, payload: unknown): void {
    const createdAtMs = Date.now();
    this.db.prepare(`
      INSERT INTO events (run_id, kind, payload_json, created_at_ms)
      VALUES (?, ?, ?, ?)
    `).run(runId, kind, stableJson(payload), createdAtMs);
    const projectPath = runId ? this.getRun(runId)?.projectPath : undefined;
    getRunEventBus().publish({ runId, projectPath, kind, payload, createdAtMs });
  }

  recordUsage(runId: string, usage: UsageSnapshot, source: string): void {
    this.db.prepare(`
      INSERT INTO usage_snapshots (
        run_id, source, input_tokens, output_tokens, cache_hit_tokens, cache_miss_tokens, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId,
      source,
      usage.inputTokens ?? null,
      usage.outputTokens ?? null,
      usage.cacheHitTokens ?? null,
      usage.cacheMissTokens ?? null,
      Date.now(),
    );
  }

  recordActionResults(runId: string, report: ActionExecutionReport): void {
    let step = this.countActions(runId);
    for (const result of report.results) {
      this.recordActionResult(runId, step, result);
      step += 1;
    }
    this.appendEvent(runId, "action_report_recorded", {
      status: report.status,
      final_message: report.final_message,
      result_count: report.results.length,
    });
  }

  recordActionResult(runId: string, stepIndex: number, result: ActionResult): void {
    const actionId = `act_${randomUUID()}`;
    this.db.prepare(`
      INSERT INTO actions (
        id, run_id, step_index, action_type, status, path, message, artifact_kind, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      actionId,
      runId,
      stepIndex,
      result.action_type,
      result.status,
      result.path ?? null,
      result.message ?? null,
      result.artifact_kind ?? null,
      Date.now(),
    );

    if (result.status === "succeeded" && result.path && result.artifact_kind) {
      this.recordArtifact(runId, result.artifact_kind, result.path, actionId, {});
    }
    if (result.action_type === "validate_artifact" && result.path) {
      this.createValidationGate({
        runId,
        subjectType: "artifact",
        subjectId: result.path,
        status: result.status === "succeeded" ? "passed" : "failed",
        summary: result.message ?? result.status,
      });
    }
  }

  recordArtifact(
    runId: string,
    kind: ArtifactKind,
    artifactPath: string,
    sourceActionId: string | null,
    metadata: unknown,
  ): void {
    this.db.prepare(`
      INSERT INTO artifacts (id, run_id, kind, path, source_action_id, metadata_json, created_at_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `art_${randomUUID()}`,
      runId,
      kind,
      artifactPath,
      sourceActionId,
      stableJson(metadata),
      Date.now(),
    );
  }

  createTask(input: {
    runId: string;
    parentTaskId?: string | null;
    agent: string;
    title: string;
    detail?: string;
    status?: TaskStatus;
  }): string {
    const id = `task_${randomUUID()}`;
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO tasks (
        id, run_id, parent_task_id, agent, title, status, detail, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.runId,
      input.parentTaskId ?? null,
      input.agent,
      input.title,
      input.status ?? "queued",
      input.detail ?? "",
      now,
      now,
    );
    this.appendEvent(input.runId, "task_created", { task_id: id, agent: input.agent, title: input.title });
    return id;
  }

  getTask(taskId: string): TaskRecord | undefined {
    const row = this.db.prepare(`
      SELECT id, run_id, parent_task_id, agent, title, status, detail, created_at_ms, updated_at_ms
      FROM tasks
      WHERE id = ?
      LIMIT 1
    `).get(taskId);
    return row ? rowToTaskRecord(row as Record<string, unknown>) : undefined;
  }

  addTaskDependency(taskId: string, dependsOnTaskId: string): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id, created_at_ms)
      VALUES (?, ?, ?)
    `).run(taskId, dependsOnTaskId, Date.now());
  }

  updateTaskStatus(taskId: string, status: TaskStatus, detail = ""): void {
    const task = this.db.prepare(`SELECT run_id FROM tasks WHERE id = ?`).get(taskId) as
      | { run_id: string }
      | undefined;
    this.db.prepare(`
      UPDATE tasks
      SET status = ?, detail = COALESCE(NULLIF(?, ''), detail), updated_at_ms = ?
      WHERE id = ?
    `).run(status, detail, Date.now(), taskId);
    if (task) this.appendEvent(task.run_id, "task_status_updated", { task_id: taskId, status, detail });
  }

  retryTask(taskId: string, detail = "retry requested"): TaskRecord {
    const task = this.getTask(taskId);
    if (!task) throw new Error(`task not found: ${taskId}`);
    if (task.status === "succeeded") {
      throw new Error(`cannot retry succeeded task: ${taskId}`);
    }
    this.db.prepare(`
      UPDATE tasks
      SET status = 'queued', detail = ?, updated_at_ms = ?
      WHERE id = ?
    `).run(detail, Date.now(), taskId);
    const run = this.getRun(task.runId);
    if (run && run.status !== "running") {
      this.updateRunStatus(task.runId, "running", "task retry requested");
    }
    this.appendEvent(task.runId, "task_retry_queued", {
      task_id: taskId,
      previous_status: task.status,
      detail,
    });
    return this.getTask(taskId) ?? task;
  }

  saveCheckpoint(runId: string, scope: string, snapshot: unknown): void {
    this.db.prepare(`
      INSERT INTO checkpoints (id, run_id, scope, snapshot_json, created_at_ms)
      VALUES (?, ?, ?, ?, ?)
    `).run(`chk_${randomUUID()}`, runId, scope, stableJson(snapshot), Date.now());
  }

  listCheckpoints(runId: string, limit = 20): CheckpointRecord[] {
    const rows = this.db.prepare(`
      SELECT id, run_id, scope, snapshot_json, created_at_ms
      FROM checkpoints
      WHERE run_id = ?
      ORDER BY created_at_ms DESC
      LIMIT ?
    `).all(runId, limit);
    return rows.map(rowToCheckpointRecord);
  }

  getCheckpoint(id: string): CheckpointRecord | undefined {
    const row = this.db.prepare(`
      SELECT id, run_id, scope, snapshot_json, created_at_ms
      FROM checkpoints
      WHERE id = ?
      LIMIT 1
    `).get(id);
    return row ? rowToCheckpointRecord(row as Record<string, unknown>) : undefined;
  }

  saveContextSnapshot(runId: string, kind: string, content: unknown): void {
    this.db.prepare(`
      INSERT INTO context_snapshots (id, run_id, kind, content_json, created_at_ms)
      VALUES (?, ?, ?, ?, ?)
    `).run(`ctx_${randomUUID()}`, runId, kind, stableJson(content), Date.now());
  }

  listContextSnapshots(runId: string, limit = 20): ContextSnapshotRecord[] {
    const rows = this.db.prepare(`
      SELECT id, run_id, kind, content_json, created_at_ms
      FROM context_snapshots
      WHERE run_id = ?
      ORDER BY created_at_ms DESC
      LIMIT ?
    `).all(runId, limit);
    return rows.map(rowToContextSnapshotRecord);
  }

  createJob(input: {
    runId?: string | null;
    kind: string;
    payload?: unknown;
    detail?: string;
    status?: JobStatus;
    maxAttempts?: number;
  }): string {
    const id = `job_${randomUUID()}`;
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO jobs (
        id, run_id, kind, status, payload_json, detail, attempts, max_attempts,
        locked_by, locked_at_ms, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL, NULL, ?, ?)
    `).run(
      id,
      input.runId ?? null,
      input.kind,
      input.status ?? "queued",
      stableJson(input.payload ?? {}),
      input.detail ?? "",
      Math.max(1, Math.trunc(input.maxAttempts ?? 3)),
      now,
      now,
    );
    this.appendEvent(input.runId ?? null, "job_created", {
      job_id: id,
      kind: input.kind,
      status: input.status ?? "queued",
    });
    return id;
  }

  ensureRunJob(input: {
    runId: string;
    kind: string;
    payload?: unknown;
    detail?: string;
    maxAttempts?: number;
  }): JobRecord {
    const existing = this.db.prepare(`
      SELECT id, run_id, kind, status, payload_json, detail, attempts, max_attempts,
             locked_by, locked_at_ms, created_at_ms, updated_at_ms
      FROM jobs
      WHERE run_id = ? AND kind = ? AND status IN ('queued', 'running')
      ORDER BY updated_at_ms DESC
      LIMIT 1
    `).get(input.runId, input.kind);
    if (existing) return rowToJobRecord(existing as Record<string, unknown>);
    const id = this.createJob(input);
    const job = this.getJob(id);
    if (!job) throw new Error(`job not found after create: ${id}`);
    return job;
  }

  getJob(jobId: string): JobRecord | undefined {
    const row = this.db.prepare(`
      SELECT id, run_id, kind, status, payload_json, detail, attempts, max_attempts,
             locked_by, locked_at_ms, created_at_ms, updated_at_ms
      FROM jobs
      WHERE id = ?
      LIMIT 1
    `).get(jobId);
    return row ? rowToJobRecord(row as Record<string, unknown>) : undefined;
  }

  listJobs(input: { runId?: string; status?: JobStatus; kind?: string; limit?: number } = {}): JobRecord[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (input.runId) {
      clauses.push("run_id = ?");
      params.push(input.runId);
    }
    if (input.status) {
      clauses.push("status = ?");
      params.push(input.status);
    }
    if (input.kind) {
      clauses.push("kind = ?");
      params.push(input.kind);
    }
    params.push(Math.max(1, Math.trunc(input.limit ?? 50)));
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db.prepare(`
      SELECT id, run_id, kind, status, payload_json, detail, attempts, max_attempts,
             locked_by, locked_at_ms, created_at_ms, updated_at_ms
      FROM jobs
      ${where}
      ORDER BY updated_at_ms DESC
      LIMIT ?
    `).all(...params);
    return rows.map(rowToJobRecord);
  }

  claimJob(jobId: string, claimant = "local-worker", staleAfterMs = 10 * 60 * 1000): JobRecord | undefined {
    const job = this.getJob(jobId);
    if (!job) throw new Error(`job not found: ${jobId}`);
    const now = Date.now();
    const stale = job.status === "running" && job.lockedAtMs !== null && now - job.lockedAtMs > staleAfterMs;
    if (job.status !== "queued" && !stale) return undefined;
    if (job.status === "queued" && job.attempts >= job.maxAttempts) {
      this.finishJob(jobId, "failed", `max attempts reached (${job.attempts}/${job.maxAttempts})`);
      return undefined;
    }
    this.db.prepare(`
      UPDATE jobs
      SET status = 'running',
          detail = ?,
          attempts = attempts + 1,
          locked_by = ?,
          locked_at_ms = ?,
          updated_at_ms = ?
      WHERE id = ?
    `).run(stale ? `reclaimed stale job by ${claimant}` : `claimed by ${claimant}`, claimant, now, now, jobId);
    this.appendEvent(job.runId, stale ? "job_reclaimed" : "job_claimed", {
      job_id: jobId,
      kind: job.kind,
      claimant,
      previous_status: job.status,
    });
    return this.getJob(jobId);
  }

  claimNextJob(input: {
    claimant?: string;
    kind?: string;
    runId?: string;
    staleAfterMs?: number;
  } = {}): JobRecord | undefined {
    const jobs = this.listJobs({
      kind: input.kind,
      runId: input.runId,
      status: "queued",
      limit: 20,
    });
    for (const job of jobs) {
      const claimed = this.claimJob(job.id, input.claimant ?? "local-worker", input.staleAfterMs);
      if (claimed) return claimed;
    }
    return undefined;
  }

  releaseJob(jobId: string, detail = "waiting for next worker tick"): JobRecord {
    const job = this.getJob(jobId);
    if (!job) throw new Error(`job not found: ${jobId}`);
    const now = Date.now();
    this.db.prepare(`
      UPDATE jobs
      SET status = 'queued', detail = ?, locked_by = NULL, locked_at_ms = NULL, updated_at_ms = ?
      WHERE id = ?
    `).run(detail, now, jobId);
    this.appendEvent(job.runId, "job_released", {
      job_id: jobId,
      kind: job.kind,
      detail,
    });
    return this.getJob(jobId) ?? job;
  }

  finishJob(jobId: string, status: Extract<JobStatus, "succeeded" | "failed" | "cancelled">, detail = ""): JobRecord {
    const job = this.getJob(jobId);
    if (!job) throw new Error(`job not found: ${jobId}`);
    const now = Date.now();
    this.db.prepare(`
      UPDATE jobs
      SET status = ?, detail = COALESCE(NULLIF(?, ''), detail),
          locked_by = NULL, locked_at_ms = NULL, updated_at_ms = ?
      WHERE id = ?
    `).run(status, detail, now, jobId);
    this.appendEvent(job.runId, "job_finished", {
      job_id: jobId,
      kind: job.kind,
      status,
      detail,
    });
    return this.getJob(jobId) ?? job;
  }

  retryJob(jobId: string, detail = "retry requested"): JobRecord {
    const job = this.getJob(jobId);
    if (!job) throw new Error(`job not found: ${jobId}`);
    const now = Date.now();
    this.db.prepare(`
      UPDATE jobs
      SET status = 'queued', detail = ?, attempts = 0,
          locked_by = NULL, locked_at_ms = NULL, updated_at_ms = ?
      WHERE id = ?
    `).run(detail, now, jobId);
    this.appendEvent(job.runId, "job_retry_queued", {
      job_id: jobId,
      kind: job.kind,
      previous_status: job.status,
      detail,
    });
    return this.getJob(jobId) ?? job;
  }

  createApprovalGate(input: {
    runId: string;
    subjectType: string;
    subjectId: string;
    summary: string;
    status?: ApprovalStatus;
  }): string {
    const id = `approval_${randomUUID()}`;
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO approval_gates (
        id, run_id, subject_type, subject_id, status, summary, rationale, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?)
    `).run(
      id,
      input.runId,
      input.subjectType,
      input.subjectId,
      input.status ?? "pending",
      input.summary,
      now,
      now,
    );
    this.appendEvent(input.runId, "approval_gate_created", {
      gate_id: id,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      summary: input.summary,
    });
    return id;
  }

  createValidationGate(input: {
    runId: string;
    subjectType: string;
    subjectId: string;
    summary: string;
    status?: ValidationStatus;
  }): string {
    const id = `validation_${randomUUID()}`;
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO validation_gates (
        id, run_id, subject_type, subject_id, status, summary, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.runId,
      input.subjectType,
      input.subjectId,
      input.status ?? "pending",
      input.summary,
      now,
      now,
    );
    this.appendEvent(input.runId, "validation_gate_recorded", {
      gate_id: id,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      status: input.status ?? "pending",
      summary: input.summary,
    });
    return id;
  }

  listValidationGates(input: { runId?: string; status?: ValidationStatus } = {}, limit = 50): ValidationGateRecord[] {
    const rows = input.runId && input.status
      ? this.db.prepare(`
          SELECT id, run_id, subject_type, subject_id, status, summary, created_at_ms, updated_at_ms
          FROM validation_gates
          WHERE run_id = ? AND status = ?
          ORDER BY created_at_ms DESC
          LIMIT ?
        `).all(input.runId, input.status, limit)
      : input.runId
        ? this.db.prepare(`
            SELECT id, run_id, subject_type, subject_id, status, summary, created_at_ms, updated_at_ms
            FROM validation_gates
            WHERE run_id = ?
            ORDER BY created_at_ms DESC
            LIMIT ?
          `).all(input.runId, limit)
        : input.status
          ? this.db.prepare(`
              SELECT id, run_id, subject_type, subject_id, status, summary, created_at_ms, updated_at_ms
              FROM validation_gates
              WHERE status = ?
              ORDER BY created_at_ms DESC
              LIMIT ?
            `).all(input.status, limit)
          : this.db.prepare(`
              SELECT id, run_id, subject_type, subject_id, status, summary, created_at_ms, updated_at_ms
              FROM validation_gates
              ORDER BY created_at_ms DESC
              LIMIT ?
            `).all(limit);
    return rows.map(rowToValidationGateRecord);
  }

  listApprovalGates(input: {
    runId?: string;
    status?: ApprovalStatus;
    subjectType?: string;
    subjectId?: string;
  } = {}, limit = 50): ApprovalGateRecord[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (input.runId) {
      clauses.push("run_id = ?");
      params.push(input.runId);
    }
    if (input.status) {
      clauses.push("status = ?");
      params.push(input.status);
    }
    if (input.subjectType) {
      clauses.push("subject_type = ?");
      params.push(input.subjectType);
    }
    if (input.subjectId) {
      clauses.push("subject_id = ?");
      params.push(input.subjectId);
    }
    params.push(limit);
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db.prepare(`
      SELECT id, run_id, subject_type, subject_id, status, summary, rationale, created_at_ms, updated_at_ms
      FROM approval_gates
      ${where}
      ORDER BY created_at_ms DESC
      LIMIT ?
    `).all(...params);
    return rows.map(rowToApprovalGateRecord);
  }

  decideApprovalGate(id: string, status: Exclude<ApprovalStatus, "pending">, rationale = ""): ApprovalGateRecord {
    const now = Date.now();
    this.db.prepare(`
      UPDATE approval_gates
      SET status = ?, rationale = ?, updated_at_ms = ?
      WHERE id = ?
    `).run(status, rationale, now, id);
    const row = this.db.prepare(`
      SELECT id, run_id, subject_type, subject_id, status, summary, rationale, created_at_ms, updated_at_ms
      FROM approval_gates
      WHERE id = ?
    `).get(id);
    if (!row) throw new Error(`approval gate not found: ${id}`);
    const record = rowToApprovalGateRecord(row);
    this.appendEvent(record.runId, "approval_gate_decided", {
      gate_id: id,
      status,
      rationale,
    });
    return record;
  }

  listRuns(limit = 20): RunRecord[] {
    const rows = this.db.prepare(`
      SELECT
        r.id,
        r.project_path,
        r.model,
        r.status,
        r.message,
        r.created_at_ms,
        r.updated_at_ms,
        (SELECT COUNT(*) FROM actions a WHERE a.run_id = r.id) AS action_count,
        (SELECT COUNT(*) FROM artifacts art WHERE art.run_id = r.id) AS artifact_count,
        (SELECT COUNT(*) FROM events e WHERE e.run_id = r.id) AS event_count,
        (SELECT SUM(COALESCE(u.cache_hit_tokens, 0)) FROM usage_snapshots u WHERE u.run_id = r.id) AS cache_hit_tokens,
        (SELECT SUM(COALESCE(u.cache_miss_tokens, 0)) FROM usage_snapshots u WHERE u.run_id = r.id) AS cache_miss_tokens
      FROM runs r
      ORDER BY r.created_at_ms DESC
      LIMIT ?
    `).all(limit);
    return rows.map(rowToRunRecord);
  }

  getRun(runId: string): RunRecord | undefined {
    const rows = this.db.prepare(`
      SELECT
        r.id,
        r.project_path,
        r.model,
        r.status,
        r.message,
        r.created_at_ms,
        r.updated_at_ms,
        (SELECT COUNT(*) FROM actions a WHERE a.run_id = r.id) AS action_count,
        (SELECT COUNT(*) FROM artifacts art WHERE art.run_id = r.id) AS artifact_count,
        (SELECT COUNT(*) FROM events e WHERE e.run_id = r.id) AS event_count,
        (SELECT SUM(COALESCE(u.cache_hit_tokens, 0)) FROM usage_snapshots u WHERE u.run_id = r.id) AS cache_hit_tokens,
        (SELECT SUM(COALESCE(u.cache_miss_tokens, 0)) FROM usage_snapshots u WHERE u.run_id = r.id) AS cache_miss_tokens
      FROM runs r
      WHERE r.id = ?
      LIMIT 1
    `).all(runId);
    return rows[0] ? rowToRunRecord(rows[0]) : undefined;
  }

  usageTotals(runId?: string): UsageTotals {
    const row = runId
      ? this.db.prepare(`
          SELECT
            COUNT(*) AS snapshots,
            SUM(COALESCE(input_tokens, 0)) AS input_tokens,
            SUM(COALESCE(output_tokens, 0)) AS output_tokens,
            SUM(COALESCE(cache_hit_tokens, 0)) AS cache_hit_tokens,
            SUM(COALESCE(cache_miss_tokens, 0)) AS cache_miss_tokens
          FROM usage_snapshots
          WHERE run_id = ?
        `).get(runId)
      : this.db.prepare(`
          SELECT
            COUNT(*) AS snapshots,
            SUM(COALESCE(input_tokens, 0)) AS input_tokens,
            SUM(COALESCE(output_tokens, 0)) AS output_tokens,
            SUM(COALESCE(cache_hit_tokens, 0)) AS cache_hit_tokens,
            SUM(COALESCE(cache_miss_tokens, 0)) AS cache_miss_tokens
          FROM usage_snapshots
        `).get();
    return rowToUsageTotals(row as Record<string, unknown> | undefined);
  }

  listUnfinishedRuns(projectPath?: string, limit = 20): RunRecord[] {
    const rows = projectPath
      ? this.db.prepare(`
          SELECT
            r.id,
            r.project_path,
            r.model,
        r.status,
        r.message,
        r.created_at_ms,
        r.updated_at_ms,
        (SELECT COUNT(*) FROM actions a WHERE a.run_id = r.id) AS action_count,
        (SELECT COUNT(*) FROM artifacts art WHERE art.run_id = r.id) AS artifact_count,
        (SELECT COUNT(*) FROM events e WHERE e.run_id = r.id) AS event_count,
        (SELECT SUM(COALESCE(u.cache_hit_tokens, 0)) FROM usage_snapshots u WHERE u.run_id = r.id) AS cache_hit_tokens,
        (SELECT SUM(COALESCE(u.cache_miss_tokens, 0)) FROM usage_snapshots u WHERE u.run_id = r.id) AS cache_miss_tokens
      FROM runs r
      WHERE r.project_path = ? AND r.status IN ('running', 'paused')
      ORDER BY r.updated_at_ms DESC
      LIMIT ?
        `).all(projectPath, limit)
      : this.db.prepare(`
          SELECT
            r.id,
            r.project_path,
            r.model,
        r.status,
        r.message,
        r.created_at_ms,
        r.updated_at_ms,
            (SELECT COUNT(*) FROM actions a WHERE a.run_id = r.id) AS action_count,
            (SELECT COUNT(*) FROM artifacts art WHERE art.run_id = r.id) AS artifact_count,
            (SELECT COUNT(*) FROM events e WHERE e.run_id = r.id) AS event_count,
            (SELECT SUM(COALESCE(u.cache_hit_tokens, 0)) FROM usage_snapshots u WHERE u.run_id = r.id) AS cache_hit_tokens,
            (SELECT SUM(COALESCE(u.cache_miss_tokens, 0)) FROM usage_snapshots u WHERE u.run_id = r.id) AS cache_miss_tokens
      FROM runs r
      WHERE r.status IN ('running', 'paused')
      ORDER BY r.updated_at_ms DESC
      LIMIT ?
        `).all(limit);
    return rows.map(rowToRunRecord);
  }

  listTasks(runId: string): TaskRecord[] {
    const rows = this.db.prepare(`
      SELECT id, run_id, parent_task_id, agent, title, status, detail, created_at_ms, updated_at_ms
      FROM tasks
      WHERE run_id = ?
      ORDER BY created_at_ms ASC
    `).all(runId);
    return rows.map(rowToTaskRecord);
  }

  listTaskDependencies(taskId: string): TaskDependencyRecord[] {
    const rows = this.db.prepare(`
      SELECT task_id, depends_on_task_id, created_at_ms
      FROM task_dependencies
      WHERE task_id = ?
      ORDER BY created_at_ms ASC
    `).all(taskId);
    return rows.map(rowToTaskDependencyRecord);
  }

  listRunnableTasks(runId: string, limit = 20): TaskRecord[] {
    const rows = this.db.prepare(`
      SELECT t.id, t.run_id, t.parent_task_id, t.agent, t.title, t.status, t.detail, t.created_at_ms, t.updated_at_ms
      FROM tasks t
      WHERE t.run_id = ?
        AND t.status = 'queued'
        AND NOT EXISTS (
          SELECT 1
          FROM task_dependencies d
          JOIN tasks dep ON dep.id = d.depends_on_task_id
          WHERE d.task_id = t.id AND dep.status != 'succeeded'
        )
      ORDER BY t.created_at_ms ASC
      LIMIT ?
    `).all(runId, limit);
    return rows.map(rowToTaskRecord);
  }

  claimNextTask(runId: string, claimant = "local-worker"): TaskRecord | undefined {
    const run = this.getRun(runId);
    if (!run || run.status === "paused" || run.status === "cancelled" || run.status === "failed") {
      return undefined;
    }
    const task = this.listRunnableTasks(runId, 1)[0];
    if (!task) return undefined;
    this.updateTaskStatus(task.id, "running", `claimed by ${claimant}`);
    this.appendEvent(runId, "task_claimed", {
      task_id: task.id,
      claimant,
    });
    return this.listTasks(runId).find((candidate) => candidate.id === task.id);
  }

  listEvents(runId?: string, limit = 30): EventRecord[] {
    const rows = runId
      ? this.db.prepare(`
          SELECT id, run_id, kind, payload_json, created_at_ms
          FROM events
          WHERE run_id = ?
          ORDER BY id DESC
          LIMIT ?
        `).all(runId, limit)
      : this.db.prepare(`
          SELECT id, run_id, kind, payload_json, created_at_ms
          FROM events
          ORDER BY id DESC
          LIMIT ?
        `).all(limit);
    return rows.map(rowToEventRecord);
  }

  traceRun(runId: string): unknown {
    const run = this.listRuns(100).find((candidate) => candidate.id === runId);
    const events = this.listEvents(runId, 100);
    const tasks = this.listTasks(runId);
    const actions = this.db.prepare(`
      SELECT step_index, action_type, status, path, message, artifact_kind, created_at_ms
      FROM actions
      WHERE run_id = ?
      ORDER BY step_index ASC
    `).all(runId);
    const artifacts = this.db.prepare(`
      SELECT kind, path, source_action_id, metadata_json, created_at_ms
      FROM artifacts
      WHERE run_id = ?
      ORDER BY created_at_ms ASC
    `).all(runId);
    const jobs = this.listJobs({ runId, limit: 20 });
    const checkpoints = this.listCheckpoints(runId, 20).map((checkpoint) => ({
      id: checkpoint.id,
      scope: checkpoint.scope,
      createdAtMs: checkpoint.createdAtMs,
    }));
    return { run, tasks, jobs, actions, artifacts, checkpoints, events };
  }

  setUiState(scope: string, key: string, value: unknown): void {
    this.db.prepare(`
      INSERT INTO ui_state (scope, key, value_json, updated_at_ms)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(scope, key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at_ms = excluded.updated_at_ms
    `).run(scope, key, stableJson(value), Date.now());
  }

  getUiState<T = unknown>(scope: string, key: string): T | undefined {
    const row = this.db.prepare(`
      SELECT value_json FROM ui_state WHERE scope = ? AND key = ?
    `).get(scope, key);
    if (!row) return undefined;
    return parseJson(String(row.value_json)) as T;
  }

  listUiState(scope: string): Array<{ key: string; value: unknown; updatedAtMs: number }> {
    const rows = this.db.prepare(`
      SELECT key, value_json, updated_at_ms
      FROM ui_state
      WHERE scope = ?
      ORDER BY key ASC
    `).all(scope);
    return rows.map((row) => ({
      key: String(row.key),
      value: parseJson(String(row.value_json)),
      updatedAtMs: Number(row.updated_at_ms),
    }));
  }

  deleteUiState(scope: string, key: string): void {
    this.db.prepare(`DELETE FROM ui_state WHERE scope = ? AND key = ?`).run(scope, key);
  }

  private countActions(runId: string): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS count FROM actions WHERE run_id = ?`).get(runId) as
      | { count: number }
      | undefined;
    return Number(row?.count ?? 0);
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        model TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT NOT NULL DEFAULT '',
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS actions (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        step_index INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        status TEXT NOT NULL,
        path TEXT,
        message TEXT,
        artifact_kind TEXT,
        created_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        path TEXT NOT NULL,
        source_action_id TEXT,
        metadata_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        parent_task_id TEXT,
        agent TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '',
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS task_dependencies (
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        depends_on_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        created_at_ms INTEGER NOT NULL,
        PRIMARY KEY (task_id, depends_on_task_id)
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        locked_by TEXT,
        locked_at_ms INTEGER,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        scope TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS context_snapshots (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        content_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memory_promotions (
        id TEXT PRIMARY KEY,
        run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
        candidate TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memory_reviews (
        id TEXT PRIMARY KEY,
        promotion_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        rationale TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS validation_gates (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        subject_type TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS approval_gates (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        subject_type TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT NOT NULL,
        rationale TEXT NOT NULL DEFAULT '',
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS usage_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        source TEXT NOT NULL,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cache_hit_tokens INTEGER,
        cache_miss_tokens INTEGER,
        created_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ui_state (
        scope TEXT NOT NULL,
        key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY (scope, key)
      );

      CREATE INDEX IF NOT EXISTS idx_events_run_id_id ON events(run_id, id);
      CREATE INDEX IF NOT EXISTS idx_actions_run_id_step ON actions(run_id, step_index);
      CREATE INDEX IF NOT EXISTS idx_tasks_run_id_status ON tasks(run_id, status);
      CREATE INDEX IF NOT EXISTS idx_jobs_status_kind ON jobs(status, kind, updated_at_ms);
      CREATE INDEX IF NOT EXISTS idx_jobs_run_id ON jobs(run_id, updated_at_ms);
    `);
  }
}

function rowToRunRecord(row: Record<string, unknown>): RunRecord {
  return {
    id: String(row.id),
    projectPath: String(row.project_path),
    model: String(row.model),
    status: String(row.status) as RunStatus,
    message: String(row.message ?? ""),
    createdAtMs: Number(row.created_at_ms),
    updatedAtMs: Number(row.updated_at_ms),
    actionCount: Number(row.action_count ?? 0),
    artifactCount: Number(row.artifact_count ?? 0),
    eventCount: Number(row.event_count ?? 0),
    cacheHitTokens: optionalNumber(row.cache_hit_tokens),
    cacheMissTokens: optionalNumber(row.cache_miss_tokens),
  };
}

function rowToTaskRecord(row: Record<string, unknown>): TaskRecord {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    parentTaskId: row.parent_task_id === null ? null : String(row.parent_task_id),
    agent: String(row.agent),
    title: String(row.title),
    status: String(row.status) as TaskStatus,
    detail: String(row.detail ?? ""),
    createdAtMs: Number(row.created_at_ms),
    updatedAtMs: Number(row.updated_at_ms),
  };
}

function rowToTaskDependencyRecord(row: Record<string, unknown>): TaskDependencyRecord {
  return {
    taskId: String(row.task_id),
    dependsOnTaskId: String(row.depends_on_task_id),
    createdAtMs: Number(row.created_at_ms),
  };
}

function rowToJobRecord(row: Record<string, unknown>): JobRecord {
  return {
    id: String(row.id),
    runId: row.run_id === null ? null : String(row.run_id),
    kind: String(row.kind),
    status: String(row.status) as JobStatus,
    payload: parseJson(String(row.payload_json ?? "{}")),
    detail: String(row.detail ?? ""),
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.max_attempts ?? 1),
    lockedBy: row.locked_by === null ? null : String(row.locked_by),
    lockedAtMs: optionalNumber(row.locked_at_ms) ?? null,
    createdAtMs: Number(row.created_at_ms),
    updatedAtMs: Number(row.updated_at_ms),
  };
}

function rowToCheckpointRecord(row: Record<string, unknown>): CheckpointRecord {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    scope: String(row.scope),
    snapshot: parseJson(String(row.snapshot_json ?? "{}")),
    createdAtMs: Number(row.created_at_ms),
  };
}

function rowToContextSnapshotRecord(row: Record<string, unknown>): ContextSnapshotRecord {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    kind: String(row.kind),
    content: parseJson(String(row.content_json ?? "{}")),
    createdAtMs: Number(row.created_at_ms),
  };
}

function rowToEventRecord(row: Record<string, unknown>): EventRecord {
  return {
    id: Number(row.id),
    runId: row.run_id === null ? null : String(row.run_id),
    kind: String(row.kind),
    payload: parseJson(String(row.payload_json)),
    createdAtMs: Number(row.created_at_ms),
  };
}

function rowToApprovalGateRecord(row: Record<string, unknown>): ApprovalGateRecord {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    subjectType: String(row.subject_type),
    subjectId: String(row.subject_id),
    status: String(row.status) as ApprovalStatus,
    summary: String(row.summary ?? ""),
    rationale: String(row.rationale ?? ""),
    createdAtMs: Number(row.created_at_ms),
    updatedAtMs: Number(row.updated_at_ms),
  };
}

function rowToValidationGateRecord(row: Record<string, unknown>): ValidationGateRecord {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    subjectType: String(row.subject_type),
    subjectId: String(row.subject_id),
    status: String(row.status) as ValidationStatus,
    summary: String(row.summary ?? ""),
    createdAtMs: Number(row.created_at_ms),
    updatedAtMs: Number(row.updated_at_ms),
  };
}

function stableJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function rowToUsageTotals(row: Record<string, unknown> | undefined): UsageTotals {
  return {
    inputTokens: Number(row?.input_tokens ?? 0),
    outputTokens: Number(row?.output_tokens ?? 0),
    cacheHitTokens: Number(row?.cache_hit_tokens ?? 0),
    cacheMissTokens: Number(row?.cache_miss_tokens ?? 0),
    snapshots: Number(row?.snapshots ?? 0),
  };
}
