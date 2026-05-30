import type { RunRecord, StateStore } from "../../state/sqlite.js";

export interface AttachedRunSnapshot {
  run?: RunRecord;
  runId?: string;
}

export class AttachService {
  constructor(
    private readonly state: StateStore,
    private readonly projectPath: string,
  ) {}

  listUnfinished(limit = 20): RunRecord[] {
    return this.state.listUnfinishedRuns(this.projectPath, limit);
  }

  latestUnfinished(): RunRecord | undefined {
    return this.listUnfinished(1)[0];
  }

  current(): AttachedRunSnapshot {
    const runId = this.state.getUiState<string>(this.scope, "attached_run_id");
    if (!runId) return {};
    return {
      runId,
      run: this.state.getRun(runId),
    };
  }

  attach(runId: string): RunRecord {
    const run = this.state.getRun(runId);
    if (!run) throw new Error(`run not found: ${runId}`);
    this.state.setUiState(this.scope, "attached_run_id", runId);
    this.state.appendEvent(runId, "run_attached", {
      project_path: this.projectPath,
    });
    return run;
  }

  attachLatest(): RunRecord {
    const run = this.latestUnfinished();
    if (!run) throw new Error("no unfinished run for this project");
    return this.attach(run.id);
  }

  clear(): void {
    const current = this.current();
    this.state.deleteUiState(this.scope, "attached_run_id");
    if (current.runId) {
      this.state.appendEvent(current.runId, "run_detached", {
        project_path: this.projectPath,
      });
    }
  }

  private get scope(): string {
    return `tui:${this.projectPath}`;
  }
}
