import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface BrowserSessionRecord {
  id: string;
  url: string;
  visible: boolean;
  createdAtMs: number;
  status: "declared" | "opened";
}

export class BrowserSessionRegistry {
  private readonly filePath: string;

  constructor(dataDir: string) {
    const dir = path.join(dataDir, "browser");
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, "sessions.jsonl");
  }

  create(input: { url: string; visible: boolean; status: BrowserSessionRecord["status"] }): BrowserSessionRecord {
    const record: BrowserSessionRecord = {
      id: `browser_${randomUUID()}`,
      url: input.url,
      visible: input.visible,
      status: input.status,
      createdAtMs: Date.now(),
    };
    fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
    return record;
  }

  list(limit = 20): BrowserSessionRecord[] {
    if (!fs.existsSync(this.filePath)) return [];
    return fs.readFileSync(this.filePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as BrowserSessionRecord)
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, limit);
  }
}
