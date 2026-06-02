import type { RuntimeConfig } from "../../bootstrap/config.js";
import type { DeepSeekProviderClient } from "../../protocol/provider.js";
import type { StateStore } from "../../state/sqlite.js";
import type { RuntimePermissionState } from "../permissions/permissionProfiles.js";
import { AgentRunService, type AgentRunDrainResult } from "./agentRunService.js";

export interface AgentDaemonRunResult {
  runId: string;
  drain: AgentRunDrainResult;
}

export interface AgentDaemonTickResult {
  status: "idle" | "succeeded" | "failed" | "partial";
  runCount: number;
  stepCount: number;
  message: string;
  runs: AgentDaemonRunResult[];
}

export class AgentDaemonService {
  private readonly runs: AgentRunService;

  constructor(
    private readonly state: StateStore,
    private readonly config: RuntimeConfig,
  ) {
    this.runs = new AgentRunService(state, config);
  }

  async tick(input: {
    provider: DeepSeekProviderClient;
    permissions: RuntimePermissionState;
    runId?: string;
    maxRuns?: number;
    maxStepsPerRun?: number;
  }): Promise<AgentDaemonTickResult> {
    const runIds = this.selectRunIds(input.runId, input.maxRuns ?? 5);
    if (runIds.length === 0) {
      return {
        status: "idle",
        runCount: 0,
        stepCount: 0,
        message: "no unfinished agent runs",
        runs: [],
      };
    }

    this.state.appendEvent(null, "agent_daemon_tick_started", {
      run_ids: runIds,
      max_steps_per_run: input.maxStepsPerRun ?? 5,
    });

    const results: AgentDaemonRunResult[] = [];
    for (const runId of runIds) {
      const job = this.state.ensureRunJob({
        runId,
        kind: "agent_run",
        payload: { runId },
        detail: "agent daemon scheduled",
        maxAttempts: 5,
      });
      const claimedJob = this.state.claimJob(job.id, "agent-daemon");
      if (!claimedJob) {
        this.state.appendEvent(runId, "agent_daemon_run_skipped", {
          job_id: job.id,
          status: job.status,
          detail: job.detail,
        });
        continue;
      }
      this.state.appendEvent(runId, "agent_daemon_run_started", {
        job_id: claimedJob.id,
        attempt: claimedJob.attempts,
        max_steps_per_run: input.maxStepsPerRun ?? 5,
      });
      const drain = await this.runs.drain({
        runId,
        provider: input.provider,
        permissions: input.permissions,
        maxSteps: input.maxStepsPerRun ?? 5,
      });
      this.state.appendEvent(runId, "agent_daemon_run_finished", {
        job_id: claimedJob.id,
        status: drain.status,
        steps: drain.steps.length,
        message: drain.message,
      });
      if (drain.status === "succeeded") {
        this.state.finishJob(claimedJob.id, "succeeded", drain.message);
      } else if (drain.status === "failed") {
        this.state.finishJob(claimedJob.id, "failed", drain.message);
      } else {
        this.state.releaseJob(claimedJob.id, drain.message);
      }
      results.push({ runId, drain });
      if (drain.status === "failed") break;
    }

    const stepCount = results.reduce((sum, result) => sum + result.drain.steps.length, 0);
    const status = summarizeDaemonStatus(results);
    const message = [
      `${status} agent daemon tick`,
      `runs=${results.length}`,
      `steps=${stepCount}`,
    ].join(" ");
    this.state.appendEvent(null, "agent_daemon_tick_finished", {
      status,
      run_count: results.length,
      step_count: stepCount,
      message,
    });

    return {
      status,
      runCount: results.length,
      stepCount,
      message,
      runs: results,
    };
  }

  private selectRunIds(runId: string | undefined, maxRuns: number): string[] {
    if (runId) {
      const run = this.state.getRun(runId);
      if (!run) throw new Error(`run not found: ${runId}`);
      if (!this.isAgentRun(runId)) throw new Error(`run is not an agent run: ${runId}`);
      if (run.status !== "running") return [];
      return [runId];
    }
    return this.state
      .listUnfinishedRuns(this.config.projectPath, Math.max(1, maxRuns * 3))
      .filter((run) => this.isAgentRun(run.id))
      .filter((run) => run.status === "running")
      .slice(0, Math.max(1, maxRuns))
      .map((run) => run.id);
  }

  private isAgentRun(runId: string): boolean {
    const run = this.state.getRun(runId);
    if (run?.message.startsWith("agent:")) return true;
    return this.state.listJobs({ runId, kind: "agent_run", limit: 1 }).length > 0;
  }
}

function summarizeDaemonStatus(results: AgentDaemonRunResult[]): AgentDaemonTickResult["status"] {
  if (results.length === 0) return "idle";
  if (results.some((result) => result.drain.status === "failed")) return "failed";
  if (results.some((result) => result.drain.status === "max_steps" || result.drain.status === "idle")) return "partial";
  return "succeeded";
}
