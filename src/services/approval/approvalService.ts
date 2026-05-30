import type { ApprovalGateRecord, ApprovalStatus, StateStore } from "../../state/sqlite.js";

const APPROVAL_SCOPE = "approval";
const APPROVAL_POLICY_KEY = "manualToolApproval";

export interface ApprovalPolicyState {
  manualToolApproval: boolean;
}

export class ApprovalService {
  constructor(private readonly state: StateStore) {}

  list(status?: ApprovalStatus): ApprovalGateRecord[] {
    return this.state.listApprovalGates({ status }, 50);
  }

  listForSubject(subjectType: string, subjectId: string): ApprovalGateRecord[] {
    return this.state.listApprovalGates({ subjectType, subjectId }, 20);
  }

  request(runId: string, summary: string, subjectType = "run", subjectId = runId): string {
    return this.state.createApprovalGate({ runId, subjectType, subjectId, summary });
  }

  decide(id: string, status: Exclude<ApprovalStatus, "pending">, rationale = ""): ApprovalGateRecord {
    return this.state.decideApprovalGate(id, status, rationale);
  }

  policy(): ApprovalPolicyState {
    return {
      manualToolApproval: Boolean(this.state.getUiState<boolean>(APPROVAL_SCOPE, APPROVAL_POLICY_KEY)),
    };
  }

  setManualToolApproval(enabled: boolean): ApprovalPolicyState {
    this.state.setUiState(APPROVAL_SCOPE, APPROVAL_POLICY_KEY, enabled);
    return this.policy();
  }
}
