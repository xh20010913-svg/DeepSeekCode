import fs from "node:fs";
import path from "node:path";
import { summarizeDiff } from "../../utils/diff.js";

export type FileEditApprovalPreviewAction = "write_file" | "apply_patch";
export type FileEditApprovalPreviewStatus = "ok" | "unavailable";

export interface FileEditApprovalPreviewRecord {
  schemaVersion: 1;
  gateId: string;
  action: FileEditApprovalPreviewAction;
  relativePath: string;
  status: FileEditApprovalPreviewStatus;
  createdAtMs: number;
  added: number;
  removed: number;
  diffLines: string[];
  clipped: boolean;
  maxLines: number;
  maxLineChars: number;
  unavailableReason?: string;
}

export interface WriteFileEditApprovalPreviewInput {
  gateId: string;
  action: FileEditApprovalPreviewAction;
  relativePath: string;
  diff?: string;
  unavailableReason?: string;
  createdAtMs?: number;
  maxLines?: number;
  maxLineChars?: number;
}

const PREVIEW_DIR = path.join(".deepseekcode", "approvals");
const DEFAULT_MAX_LINES = 120;
const DEFAULT_MAX_LINE_CHARS = 180;

export function fileEditApprovalPreviewPath(projectPath: string, gateId: string): string {
  return path.join(projectPath, PREVIEW_DIR, `${sanitizeFileName(gateId)}.json`);
}

export function writeFileEditApprovalPreview(
  projectPath: string,
  input: WriteFileEditApprovalPreviewInput,
): FileEditApprovalPreviewRecord {
  const maxLines = input.maxLines ?? DEFAULT_MAX_LINES;
  const maxLineChars = input.maxLineChars ?? DEFAULT_MAX_LINE_CHARS;
  const clipped = input.diff ? clipDiffLines(input.diff, maxLines, maxLineChars) : { lines: [], clipped: false };
  const summary = input.diff ? summarizeDiff(input.diff) : { added: 0, removed: 0 };
  const record: FileEditApprovalPreviewRecord = {
    schemaVersion: 1,
    gateId: input.gateId,
    action: input.action,
    relativePath: input.relativePath,
    status: input.diff ? "ok" : "unavailable",
    createdAtMs: input.createdAtMs ?? Date.now(),
    added: summary.added,
    removed: summary.removed,
    diffLines: clipped.lines,
    clipped: clipped.clipped,
    maxLines,
    maxLineChars,
    ...(input.diff ? {} : { unavailableReason: input.unavailableReason ?? "unavailable" }),
  };

  const targetPath = fileEditApprovalPreviewPath(projectPath, input.gateId);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return record;
}

export function readFileEditApprovalPreview(
  projectPath: string,
  gateId: string,
): FileEditApprovalPreviewRecord | null {
  const targetPath = fileEditApprovalPreviewPath(projectPath, gateId);
  if (!fs.existsSync(targetPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(targetPath, "utf8")) as Partial<FileEditApprovalPreviewRecord>;
    if (!isFileEditApprovalPreviewRecord(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clipDiffLines(diff: string, maxLines: number, maxLineChars: number): { lines: string[]; clipped: boolean } {
  const allLines = diff.split(/\r?\n/);
  const visible = allLines.slice(0, Math.max(0, maxLines));
  let clipped = allLines.length > visible.length;
  const lines = visible.map((line) => {
    if (line.length <= maxLineChars) return line;
    clipped = true;
    if (maxLineChars <= 3) return line.slice(0, Math.max(0, maxLineChars));
    return `${line.slice(0, maxLineChars - 3)}...`;
  });
  return { lines, clipped };
}

function isFileEditApprovalPreviewRecord(value: Partial<FileEditApprovalPreviewRecord>): value is FileEditApprovalPreviewRecord {
  return value.schemaVersion === 1
    && typeof value.gateId === "string"
    && (value.action === "write_file" || value.action === "apply_patch")
    && typeof value.relativePath === "string"
    && (value.status === "ok" || value.status === "unavailable")
    && typeof value.createdAtMs === "number"
    && typeof value.added === "number"
    && typeof value.removed === "number"
    && Array.isArray(value.diffLines)
    && value.diffLines.every((line) => typeof line === "string")
    && typeof value.clipped === "boolean"
    && typeof value.maxLines === "number"
    && typeof value.maxLineChars === "number";
}

function sanitizeFileName(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9_.-]/g, "_");
  return safe || "approval";
}
