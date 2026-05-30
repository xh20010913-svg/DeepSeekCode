export interface DiagnosticRecord {
  kind: string;
  message: string;
  createdAtMs: number;
  metadata?: unknown;
}

export class DiagnosticTracker {
  private readonly records: DiagnosticRecord[] = [];

  record(kind: string, message: string, metadata?: unknown): void {
    this.records.push({ kind, message, metadata, createdAtMs: Date.now() });
    if (this.records.length > 300) this.records.shift();
  }

  list(limit = 50): DiagnosticRecord[] {
    return this.records.slice(-limit);
  }
}

export const diagnosticTracker = new DiagnosticTracker();
