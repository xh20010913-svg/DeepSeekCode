import type { StateStore, TaskRecord } from "../../state/sqlite.js";
import { DurableTaskQueue } from "../../tasks/queue.js";
import { SshProfileService } from "./sshProfileService.js";
import { runSshCommand, summarizeSshCommand, type SshExecutionPolicy } from "./sshRemoteExecutor.js";

export interface SshWorkerStepResult {
  status: "idle" | "completed" | "failed";
  message: string;
  task?: TaskRecord;
}

export interface SshWorkerDrainResult {
  status: "idle" | "completed" | "failed" | "max_steps";
  runId: string;
  profileName: string;
  steps: SshWorkerStepResult[];
  message: string;
}

export class SshQueueWorker {
  private readonly profiles: SshProfileService;
  private readonly queue: DurableTaskQueue;

  constructor(
    private readonly state: StateStore,
    private readonly projectPath: string,
  ) {
    this.profiles = new SshProfileService(projectPath);
    this.queue = new DurableTaskQueue(state);
  }

  async step(input: {
    runId: string;
    profileName: string;
    policy: SshExecutionPolicy;
  }): Promise<SshWorkerStepResult> {
    const profile = this.profiles.getProfile(input.profileName);
    if (!profile) throw new Error(`ssh profile not found: ${input.profileName}`);
    const task = this.claimEligibleTask(input.runId, profile.name);
    if (!task) return { status: "idle", message: "no runnable SSH task" };
    const command = commandFromTask(task);

    this.state.appendEvent(input.runId, "ssh_worker_step_started", {
      task_id: task.id,
      profile: profile.name,
      command,
    });

    try {
      const output = await runSshCommand(profile, command, input.policy);
      this.profiles.recordCommand(profile.name, output);
      const summary = summarizeSshCommand(output);
      if (output.exitCode === 0 && !output.timedOut) {
        this.queue.complete(task.id, summary);
        this.state.appendEvent(input.runId, "ssh_worker_step_completed", {
          task_id: task.id,
          profile: profile.name,
          exit_code: output.exitCode,
          duration_ms: output.durationMs,
        });
        return { status: "completed", message: summary, task };
      }
      this.queue.fail(task.id, summary);
      this.state.appendEvent(input.runId, "ssh_worker_step_failed", {
        task_id: task.id,
        profile: profile.name,
        exit_code: output.exitCode,
        timed_out: output.timedOut,
        duration_ms: output.durationMs,
      });
      return { status: "failed", message: summary, task };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.queue.fail(task.id, message);
      this.state.appendEvent(input.runId, "ssh_worker_step_failed", {
        task_id: task.id,
        profile: profile.name,
        message,
      });
      return { status: "failed", message, task };
    }
  }

  async drain(input: {
    runId: string;
    profileName: string;
    policy: SshExecutionPolicy;
    maxTasks?: number;
  }): Promise<SshWorkerDrainResult> {
    const maxTasks = Math.min(20, Math.max(1, Math.trunc(input.maxTasks ?? 5)));
    const steps: SshWorkerStepResult[] = [];
    for (let index = 0; index < maxTasks; index += 1) {
      const step = await this.step(input);
      steps.push(step);
      if (step.status === "failed") {
        return {
          status: "failed",
          runId: input.runId,
          profileName: input.profileName,
          steps,
          message: step.message,
        };
      }
      if (step.status === "idle") {
        return {
          status: steps.length === 1 ? "idle" : "completed",
          runId: input.runId,
          profileName: input.profileName,
          steps,
          message: step.message,
        };
      }
    }
    return {
      status: "max_steps",
      runId: input.runId,
      profileName: input.profileName,
      steps,
      message: `stopped after ${maxTasks} SSH worker steps`,
    };
  }

  private claimEligibleTask(runId: string, profileName: string): TaskRecord | undefined {
    const run = this.state.getRun(runId);
    if (!run || run.status === "paused" || run.status === "cancelled" || run.status === "failed") {
      return undefined;
    }
    const task = this.state.listRunnableTasks(runId, 50)
      .find((candidate) => isEligibleSshTask(candidate, profileName));
    if (!task) return undefined;
    this.state.updateTaskStatus(task.id, "running", `claimed by ssh:${profileName}`);
    this.state.appendEvent(runId, "task_claimed", {
      task_id: task.id,
      claimant: `ssh:${profileName}`,
    });
    return { ...task, status: "running" };
  }
}

export function isEligibleSshTask(task: TaskRecord, profileName: string): boolean {
  const agent = task.agent.trim().toLowerCase();
  const profile = profileName.trim().toLowerCase();
  return agent === "ssh" || agent === "remote" || agent === `ssh:${profile}` || agent === `remote:${profile}`;
}

function commandFromTask(task: TaskRecord): string {
  const raw = task.detail.trim() || task.title.trim();
  const command = raw.replace(/^(cmd|command)\s*:\s*/i, "").trim();
  if (!command) throw new Error(`SSH task has no command: ${task.id}`);
  return command;
}
