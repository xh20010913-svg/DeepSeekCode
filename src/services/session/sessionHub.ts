import path from "node:path";
import { getRunEventBus, type RunEventBusSubscription } from "../runs/runEventBus.js";

export interface SessionHubRunState {
  runId: string;
  projectPath: string;
  status: "running" | "succeeded" | "failed" | "paused" | "cancelled" | "unknown";
  lastEventKind: string;
  lastEventAtMs: number;
}

export interface SessionHubRemoteState {
  channel: "wechat-openclaw" | "wecom" | string;
  projectPath: string;
  status: string;
  updatedAtMs: number;
}

export class SessionHub {
  private readonly runs = new Map<string, SessionHubRunState>();
  private readonly remotes = new Map<string, SessionHubRemoteState>();
  private subscription?: RunEventBusSubscription;

  start(): void {
    if (this.subscription) return;
    this.subscription = getRunEventBus().subscribe({}, (event) => {
      if (!event.runId || !event.projectPath) return;
      const key = normalizeProject(event.projectPath);
      const previous = this.runs.get(key);
      this.runs.set(key, {
        runId: event.runId,
        projectPath: event.projectPath,
        status: runStatusFromEvent(event.kind, event.payload) ?? previous?.status ?? "unknown",
        lastEventKind: event.kind,
        lastEventAtMs: event.createdAtMs,
      });
    });
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
  }

  updateRemote(input: SessionHubRemoteState): void {
    this.remotes.set(`${input.channel}:${normalizeProject(input.projectPath)}`, input);
  }

  latestRun(projectPath: string): SessionHubRunState | undefined {
    this.start();
    return this.runs.get(normalizeProject(projectPath));
  }

  remoteStatus(channel: string, projectPath: string): SessionHubRemoteState | undefined {
    return this.remotes.get(`${channel}:${normalizeProject(projectPath)}`);
  }
}

const singleton = new SessionHub();

export function getSessionHub(): SessionHub {
  singleton.start();
  return singleton;
}

function normalizeProject(projectPath: string): string {
  return path.resolve(projectPath).replace(/\\/g, "/").toLowerCase();
}

function runStatusFromEvent(kind: string, payload: unknown): SessionHubRunState["status"] | undefined {
  if (kind !== "run_status_updated") return kind === "run_created" ? "running" : undefined;
  if (!payload || typeof payload !== "object") return undefined;
  const status = (payload as { status?: unknown }).status;
  if (status === "running" || status === "succeeded" || status === "failed" || status === "paused" || status === "cancelled") {
    return status;
  }
  return undefined;
}
