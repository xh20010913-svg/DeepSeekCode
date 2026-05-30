import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type BrowserTrajectoryAction = "open" | "snapshot" | "screenshot" | "click" | "type";
export type BrowserTrajectorySource = "command" | "tool";
export type BrowserTrajectoryStatus = "succeeded" | "failed";

export interface BrowserTrajectoryInput {
  action: BrowserTrajectoryAction;
  source: BrowserTrajectorySource;
  url: string;
  status: BrowserTrajectoryStatus;
  message?: string;
  finalUrl?: string;
  selector?: string;
  path?: string;
  title?: string;
  bytes?: number;
  textChars?: number;
}

export interface BrowserTrajectoryRecord extends BrowserTrajectoryInput {
  id: string;
  createdAtMs: number;
}

export class BrowserTrajectoryRecorder {
  private readonly filePath: string;

  constructor(dataDir: string) {
    const dir = path.join(dataDir, "browser");
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, "trajectories.jsonl");
  }

  record(input: BrowserTrajectoryInput): BrowserTrajectoryRecord {
    const record: BrowserTrajectoryRecord = {
      id: `browser_traj_${randomUUID()}`,
      createdAtMs: Date.now(),
      ...input,
    };
    fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
    return record;
  }

  list(limit = 20): BrowserTrajectoryRecord[] {
    if (!fs.existsSync(this.filePath)) return [];
    return fs.readFileSync(this.filePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as BrowserTrajectoryRecord)
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, Math.max(1, limit));
  }

  render(limit = 20): string {
    const records = this.list(limit);
    if (records.length === 0) return "No browser trajectory records.";
    return records.map(renderBrowserTrajectoryRecord).join("\n");
  }
}

export function renderBrowserTrajectoryRecord(record: BrowserTrajectoryRecord): string {
  const parts = [
    record.id,
    record.status,
    record.source,
    record.action,
    record.url,
  ];
  if (record.finalUrl && record.finalUrl !== record.url) parts.push(`final=${record.finalUrl}`);
  if (record.selector) parts.push(`selector=${record.selector}`);
  if (record.path) parts.push(`path=${record.path}`);
  if (record.title) parts.push(`title=${record.title}`);
  if (typeof record.bytes === "number") parts.push(`bytes=${record.bytes}`);
  if (typeof record.textChars === "number") parts.push(`textChars=${record.textChars}`);
  if (record.message) parts.push(`message=${truncateSingleLine(record.message, 220)}`);
  return parts.join(" ");
}

function truncateSingleLine(value: string, maxChars: number): string {
  const singleLine = value.replace(/\s+/g, " ").trim();
  return singleLine.length > maxChars ? `${singleLine.slice(0, maxChars - 3)}...` : singleLine;
}
