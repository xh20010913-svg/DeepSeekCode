import type { JobRecord, JobStatus, StateStore } from "../state/sqlite.js";

export type { JobRecord, JobStatus };

export class JobQueue {
  constructor(private readonly state: StateStore) {}

  enqueue<T>(kind: string, payload: T, options: { runId?: string; maxAttempts?: number } = {}): JobRecord {
    const id = this.state.createJob({
      kind,
      payload,
      runId: options.runId,
      maxAttempts: options.maxAttempts,
    });
    const job = this.state.getJob(id);
    if (!job) throw new Error(`job not found after enqueue: ${id}`);
    return job;
  }

  claim(input: { kind?: string; runId?: string; claimant?: string } = {}): JobRecord | undefined {
    return this.state.claimNextJob({
      kind: input.kind,
      runId: input.runId,
      claimant: input.claimant ?? "job-queue",
    });
  }

  finish(id: string, status: Extract<JobStatus, "succeeded" | "failed" | "cancelled">): void {
    this.state.finishJob(id, status);
  }

  retry(id: string, detail = "retry requested"): JobRecord {
    return this.state.retryJob(id, detail);
  }

  list(input: { kind?: string; runId?: string; status?: JobStatus; limit?: number } = {}): JobRecord[] {
    return this.state.listJobs(input);
  }
}
