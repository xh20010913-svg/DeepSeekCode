import { AttachService, type AttachedRunSnapshot } from "../services/attach/attachService.js";
import type { StateStore } from "../state/sqlite.js";

export function useAttachedRun(state: StateStore, projectPath: string): AttachedRunSnapshot {
  return new AttachService(state, projectPath).current();
}
