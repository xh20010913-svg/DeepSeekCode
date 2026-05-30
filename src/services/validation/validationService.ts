import type { StateStore, ValidationGateRecord, ValidationStatus } from "../../state/sqlite.js";

export class ValidationService {
  constructor(private readonly state: StateStore) {}

  list(runId?: string, status?: ValidationStatus): ValidationGateRecord[] {
    return this.state.listValidationGates({ runId, status }, 50);
  }

  record(input: {
    runId: string;
    subjectType: string;
    subjectId: string;
    summary: string;
    status?: ValidationStatus;
  }): string {
    return this.state.createValidationGate(input);
  }

  passed(runId?: string): number {
    return this.list(runId, "passed").length;
  }

  failed(runId?: string): number {
    return this.list(runId, "failed").length;
  }
}
