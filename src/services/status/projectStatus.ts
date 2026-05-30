import type { RuntimeConfig } from "../../bootstrap/config.js";
import { summarizeCacheTelemetry } from "../cache/telemetry.js";
import { inferProfile, type RuntimePermissionState } from "../permissions/permissionProfiles.js";
import type { RunRecord, StateStore, TaskStatus } from "../../state/sqlite.js";
import { getGitStatus } from "../../utils/diff.js";

export interface GitStatusSummary {
  available: boolean;
  clean: boolean;
  modified: number;
  added: number;
  deleted: number;
  renamed: number;
  untracked: number;
  conflicted: number;
  raw: string;
  error?: string;
}

export interface ProjectStatusSummary {
  product: "DeepSeekCode";
  projectPath: string;
  dataDir: string;
  model: string;
  providerReady: boolean;
  permissionProfile: string;
  permissions: {
    shell: boolean;
    browser: boolean;
  };
  cache: {
    hitTokens: number;
    missTokens: number;
    rate: string;
    observedRuns: number;
  };
  runs: {
    totalRecent: number;
    unfinished: number;
    latest?: Pick<RunRecord, "id" | "status" | "message" | "actionCount" | "artifactCount" | "eventCount">;
  };
  tasks: Record<TaskStatus, number>;
  gates: {
    approvalsPending: number;
    validationsPending: number;
    validationsFailed: number;
  };
  git: GitStatusSummary;
}

export function buildProjectStatus(
  config: RuntimeConfig,
  state: StateStore,
  permissions: RuntimePermissionState,
): ProjectStatusSummary {
  const runs = state.listRuns(20);
  const latest = runs[0];
  const tasks = summarizeTasks(latest ? state.listTasks(latest.id) : []);
  const cache = summarizeCacheTelemetry(runs);
  return {
    product: "DeepSeekCode",
    projectPath: config.projectPath,
    dataDir: config.dataDir,
    model: config.model,
    providerReady: Boolean(config.provider),
    permissionProfile: permissions.profile ?? inferProfile(permissions),
    permissions: {
      shell: permissions.allowShell,
      browser: permissions.allowBrowser,
    },
    cache,
    runs: {
      totalRecent: runs.length,
      unfinished: state.listUnfinishedRuns(config.projectPath, 50).length,
      latest: latest
        ? {
            id: latest.id,
            status: latest.status,
            message: latest.message,
            actionCount: latest.actionCount,
            artifactCount: latest.artifactCount,
            eventCount: latest.eventCount,
          }
        : undefined,
    },
    tasks,
    gates: {
      approvalsPending: state.listApprovalGates({ status: "pending" }, 100).length,
      validationsPending: state.listValidationGates({ status: "pending" }, 100).length,
      validationsFailed: state.listValidationGates({ status: "failed" }, 100).length,
    },
    git: summarizeGitStatus(config.projectPath),
  };
}

export function summarizeGitStatus(projectPath: string): GitStatusSummary {
  const result = getGitStatus(projectPath);
  if (!result.ok) {
    return {
      available: false,
      clean: false,
      modified: 0,
      added: 0,
      deleted: 0,
      renamed: 0,
      untracked: 0,
      conflicted: 0,
      raw: "",
      error: result.error,
    };
  }
  const summary: GitStatusSummary = {
    available: true,
    clean: !result.diff.trim(),
    modified: 0,
    added: 0,
    deleted: 0,
    renamed: 0,
    untracked: 0,
    conflicted: 0,
    raw: result.diff,
  };
  for (const line of result.diff.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const code = line.slice(0, 2);
    if (code === "??") {
      summary.untracked += 1;
      continue;
    }
    if (code === "UU" || code.includes("U")) {
      summary.conflicted += 1;
      continue;
    }
    if (code.includes("R")) summary.renamed += 1;
    else if (code.includes("A")) summary.added += 1;
    else if (code.includes("D")) summary.deleted += 1;
    else if (code.includes("M")) summary.modified += 1;
  }
  return summary;
}

export function formatProjectStatus(status: ProjectStatusSummary): string {
  const latest = status.runs.latest
    ? `${status.runs.latest.status} ${status.runs.latest.id} ${status.runs.latest.actionCount}a ${status.runs.latest.artifactCount}f`
    : "none";
  return [
    "DeepSeekCode status",
    `project: ${status.projectPath}`,
    `data: ${status.dataDir}`,
    `model: ${status.model}`,
    `provider: ${status.providerReady ? "ready" : "missing"}`,
    `permissions: ${status.permissionProfile} shell=${status.permissions.shell ? "on" : "off"} browser=${status.permissions.browser ? "on" : "off"}`,
    `cache: hit=${status.cache.hitTokens} miss=${status.cache.missTokens} rate=${status.cache.rate} runs=${status.cache.observedRuns}`,
    `runs: recent=${status.runs.totalRecent} unfinished=${status.runs.unfinished} latest=${latest}`,
    `tasks(latest): queued=${status.tasks.queued} running=${status.tasks.running} paused=${status.tasks.paused} failed=${status.tasks.failed} succeeded=${status.tasks.succeeded} cancelled=${status.tasks.cancelled}`,
    `gates: approvals_pending=${status.gates.approvalsPending} validations_pending=${status.gates.validationsPending} validations_failed=${status.gates.validationsFailed}`,
    `git: ${formatGitStatus(status.git)}`,
  ].join("\n");
}

export function formatGitStatus(git: GitStatusSummary): string {
  if (!git.available) return `unavailable${git.error ? ` (${firstLine(git.error)})` : ""}`;
  if (git.clean) return "clean";
  return [
    `modified=${git.modified}`,
    `added=${git.added}`,
    `deleted=${git.deleted}`,
    `renamed=${git.renamed}`,
    `untracked=${git.untracked}`,
    `conflicted=${git.conflicted}`,
  ].join(" ");
}

function summarizeTasks(tasks: Array<{ status: TaskStatus }>): Record<TaskStatus, number> {
  const counts: Record<TaskStatus, number> = {
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    paused: 0,
    cancelled: 0,
  };
  for (const task of tasks) counts[task.status] += 1;
  return counts;
}

function firstLine(value: string): string {
  return value.split(/\r?\n/)[0]?.trim() ?? "";
}
