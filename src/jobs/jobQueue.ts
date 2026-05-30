import { randomUUID } from "node:crypto";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface Job<T = unknown> {
  id: string;
  kind: string;
  payload: T;
  status: JobStatus;
  createdAtMs: number;
  updatedAtMs: number;
}

export class JobQueue {
  private readonly jobs: Job[] = [];

  enqueue<T>(kind: string, payload: T): Job<T> {
    const now = Date.now();
    const job: Job<T> = {
      id: `job_${randomUUID()}`,
      kind,
      payload,
      status: "queued",
      createdAtMs: now,
      updatedAtMs: now,
    };
    this.jobs.push(job);
    return job;
  }

  claim(): Job | undefined {
    const job = this.jobs.find((candidate) => candidate.status === "queued");
    if (!job) return undefined;
    job.status = "running";
    job.updatedAtMs = Date.now();
    return job;
  }

  finish(id: string, status: Extract<JobStatus, "succeeded" | "failed" | "cancelled">): void {
    const job = this.jobs.find((candidate) => candidate.id === id);
    if (!job) throw new Error(`unknown job: ${id}`);
    job.status = status;
    job.updatedAtMs = Date.now();
  }

  list(): Job[] {
    return [...this.jobs];
  }
}
