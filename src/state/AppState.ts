import { createStore } from "./store.js";
import type { CacheTelemetrySummary } from "../services/cache/telemetry.js";
import type { RuntimePermissionState } from "../services/permissions/permissionProfiles.js";

export interface AppState {
  busy: boolean;
  currentRunId: string | null;
  currentTaskId: string | null;
  transcriptCount: number;
  cache: CacheTelemetrySummary;
  permissions: RuntimePermissionState;
}

export const appStateStore = createStore<AppState>({
  busy: false,
  currentRunId: null,
  currentTaskId: null,
  transcriptCount: 0,
  cache: {
    hitTokens: 0,
    missTokens: 0,
    rate: "n/a",
    observedRuns: 0,
  },
  permissions: {
    allowShell: false,
    allowBrowser: false,
    profile: "safe",
  },
});

export function setBusy(busy: boolean, runId?: string | null): void {
  appStateStore.setState((previous) => ({
    ...previous,
    busy,
    currentRunId: runId === undefined ? previous.currentRunId : runId,
  }));
}

export function updatePermissions(input: Partial<AppState["permissions"]>): void {
  appStateStore.setState((previous) => ({
    ...previous,
    permissions: {
      ...previous.permissions,
      ...input,
    },
  }));
}
