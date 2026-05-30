import type { RunRecord, StateStore } from "../../state/sqlite.js";

export class RunService {
  constructor(private readonly state: StateStore) {}

  recent(limit = 20): RunRecord[] {
    return this.state.listRuns(limit);
  }

  latest(): RunRecord | undefined {
    return this.recent(1)[0];
  }

  trace(runId: string): unknown {
    return this.state.traceRun(runId);
  }
}
