export type TaskAgent = "Commander" | "Planner" | "Builder" | "Tester" | "Reviewer" | "Researcher";
export type TaskLifecycleStatus = "queued" | "running" | "succeeded" | "failed" | "paused" | "cancelled";

export interface Task {
  id: string;
  runId: string;
  agent: TaskAgent | string;
  title: string;
  detail: string;
  status: TaskLifecycleStatus;
}
