import fs from "node:fs";
import path from "node:path";
import type { LogRecord } from "../../utils/log.js";

export function appendRuntimeLog(dataDir: string, record: LogRecord): void {
  const dir = path.join(dataDir, "logs");
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, "deepseekcode.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
}

export function readRuntimeLog(dataDir: string, limit = 100): LogRecord[] {
  const file = path.join(dataDir, "logs", "deepseekcode.jsonl");
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-limit)
    .map((line) => JSON.parse(line) as LogRecord);
}
