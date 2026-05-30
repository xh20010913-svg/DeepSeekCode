import type { ApprovalGateRecord, ApprovalStatus, StateStore } from "../state/sqlite.js";

export function useApprovals(
  state: StateStore,
  status?: ApprovalStatus,
  limit = 10,
): ApprovalGateRecord[] {
  return state.listApprovalGates({ status }, limit);
}
