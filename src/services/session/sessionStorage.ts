import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type TranscriptRole = "user" | "assistant" | "system" | "tool" | "error";

export interface TranscriptRecord {
  id: string;
  role: TranscriptRole;
  text: string;
  createdAtMs: number;
  runId?: string | null;
}

export class SessionStorage {
  readonly sessionId: string;
  private readonly filePath: string;

  constructor(dataDir: string, sessionId = `session_${randomUUID()}`) {
    this.sessionId = sessionId;
    const dir = path.join(dataDir, "sessions");
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, `${sessionId}.jsonl`);
  }

  append(record: Omit<TranscriptRecord, "id" | "createdAtMs">): TranscriptRecord {
    const full: TranscriptRecord = {
      id: `msg_${randomUUID()}`,
      createdAtMs: Date.now(),
      ...record,
    };
    fs.appendFileSync(this.filePath, `${JSON.stringify(full)}\n`, "utf8");
    return full;
  }

  readAll(limit = 200): TranscriptRecord[] {
    if (!fs.existsSync(this.filePath)) return [];
    return fs.readFileSync(this.filePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line) as TranscriptRecord);
  }

  static list(dataDir: string, limit = 20): Array<{ sessionId: string; path: string; updatedAtMs: number; bytes: number }> {
    const dir = path.join(dataDir, "sessions");
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((name) => name.endsWith(".jsonl"))
      .map((name) => {
        const full = path.join(dir, name);
        const stat = fs.statSync(full);
        return {
          sessionId: name.slice(0, -".jsonl".length),
          path: full,
          updatedAtMs: stat.mtimeMs,
          bytes: stat.size,
        };
      })
      .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
      .slice(0, limit);
  }
}
