import fs from "node:fs";
import path from "node:path";
import type { CacheStabilityReport } from "./cacheStability.js";

export interface CacheShapeRecord {
  fingerprint: string;
  firstSeenAt: string;
  lastSeenAt: string;
  count: number;
  risk: CacheStabilityReport["risk"];
  stableChars: number;
  dynamicChars: number;
  requestChars: number;
  dynamicShare: number;
  truncatedBlocks: string[];
}

export interface CacheShapeObservation {
  record: CacheShapeRecord;
  previousCount: number;
  repeated: boolean;
  totalShapes: number;
}

interface CacheShapeHistoryFile {
  version: 1;
  records: CacheShapeRecord[];
}

export class CacheShapeHistoryService {
  private readonly filePath: string;

  constructor(private readonly projectPath: string) {
    this.filePath = path.join(projectPath, ".deepseekcode", "cache-shapes.json");
  }

  record(report: CacheStabilityReport, now = new Date()): CacheShapeObservation {
    const history = this.read();
    const timestamp = now.toISOString();
    const existing = history.records.find((record) => record.fingerprint === report.shapeFingerprint);
    const previousCount = existing?.count ?? 0;
    const record: CacheShapeRecord = {
      fingerprint: report.shapeFingerprint,
      firstSeenAt: existing?.firstSeenAt ?? timestamp,
      lastSeenAt: timestamp,
      count: previousCount + 1,
      risk: report.risk,
      stableChars: report.stableChars,
      dynamicChars: report.dynamicChars,
      requestChars: report.requestChars,
      dynamicShare: report.dynamicShare,
      truncatedBlocks: report.truncatedBlocks,
    };
    const records = [
      record,
      ...history.records.filter((entry) => entry.fingerprint !== report.shapeFingerprint),
    ].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, 50);
    this.write({ version: 1, records });
    return {
      record,
      previousCount,
      repeated: previousCount > 0,
      totalShapes: records.length,
    };
  }

  list(limit = 10): CacheShapeRecord[] {
    return this.read().records
      .slice()
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
      .slice(0, Math.max(1, Math.min(50, limit)));
  }

  clear(): number {
    const count = this.read().records.length;
    if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath);
    return count;
  }

  path(): string {
    return this.filePath;
  }

  private read(): CacheShapeHistoryFile {
    if (!fs.existsSync(this.filePath)) return { version: 1, records: [] };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Partial<CacheShapeHistoryFile>;
      if (parsed.version !== 1 || !Array.isArray(parsed.records)) return { version: 1, records: [] };
      return {
        version: 1,
        records: parsed.records.filter(isCacheShapeRecord),
      };
    } catch {
      return { version: 1, records: [] };
    }
  }

  private write(history: CacheShapeHistoryFile): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(history, null, 2)}\n`, "utf8");
  }
}

export function formatCacheShapeObservation(observation: CacheShapeObservation): string {
  const repeat = observation.repeated ? `repeat=${observation.record.count}` : "repeat=first";
  return [
    `shapeSeen=${repeat}`,
    `shape=${observation.record.fingerprint}`,
    `risk=${observation.record.risk}`,
    `tracked=${observation.totalShapes}`,
  ].join(" ");
}

export function formatCacheShapeHistory(records: CacheShapeRecord[]): string {
  if (records.length === 0) return "No cache prompt shapes recorded yet. Run /cache plan <goal> first.";
  return records.map((record) => [
    `shape ${record.fingerprint}`,
    `count=${record.count}`,
    `risk=${record.risk}`,
    `dynamic=${Math.round(record.dynamicShare * 100)}%`,
    `stable=${record.stableChars}`,
    `last=${record.lastSeenAt}`,
    record.truncatedBlocks.length ? `truncated=${record.truncatedBlocks.join(",")}` : "truncated=none",
  ].join(" ")).join("\n");
}

function isCacheShapeRecord(value: unknown): value is CacheShapeRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<CacheShapeRecord>;
  return typeof record.fingerprint === "string"
    && typeof record.firstSeenAt === "string"
    && typeof record.lastSeenAt === "string"
    && typeof record.count === "number"
    && (record.risk === "low" || record.risk === "medium" || record.risk === "high")
    && typeof record.stableChars === "number"
    && typeof record.dynamicChars === "number"
    && typeof record.requestChars === "number"
    && typeof record.dynamicShare === "number"
    && Array.isArray(record.truncatedBlocks)
    && record.truncatedBlocks.every((entry) => typeof entry === "string");
}
