import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildRepositoryMap } from "../../context/repositoryMap.js";
import { safeJoin } from "../../tools/pathSafety.js";
import { createUnifiedDiff, summarizeDiff, truncateDiff } from "../../utils/diff.js";

export interface WorkspaceCheckpointFile {
  path: string;
  content: string;
  size: number;
  sha256: string;
}

export interface WorkspaceCheckpoint {
  id: string;
  label: string;
  projectPath: string;
  createdAtMs: number;
  fileCount: number;
  totalBytes: number;
  truncated: boolean;
  files: WorkspaceCheckpointFile[];
}

export interface CheckpointSummary {
  id: string;
  label: string;
  createdAtMs: number;
  fileCount: number;
  totalBytes: number;
  truncated: boolean;
}

export interface CheckpointDiffSummary {
  changed: number;
  added: number;
  removed: number;
  diff: string;
}

export interface CheckpointRestoreResult {
  restored: number;
  deleted: number;
  skipped: number;
}

const TEXT_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".toml",
  ".yml",
  ".yaml",
  ".css",
  ".html",
  ".txt",
  ".mjs",
  ".cjs",
]);
const MAX_FILE_BYTES = 256_000;
const MAX_TOTAL_BYTES = 4_000_000;
const MAX_DIFF_CHARS = 20_000;

export class WorkspaceCheckpointService {
  constructor(private readonly projectPath: string) {}

  create(label = "manual checkpoint"): WorkspaceCheckpoint {
    const resolvedRoot = path.resolve(this.projectPath);
    const files: WorkspaceCheckpointFile[] = [];
    let totalBytes = 0;
    let truncated = false;
    const repositoryMap = buildRepositoryMap(resolvedRoot, 1000);

    for (const file of repositoryMap.files) {
      if (!TEXT_EXTS.has(file.ext)) continue;
      if (file.size > MAX_FILE_BYTES) {
        truncated = true;
        continue;
      }
      if (totalBytes + file.size > MAX_TOTAL_BYTES) {
        truncated = true;
        break;
      }
      const filePath = safeJoin(resolvedRoot, file.path);
      const content = fs.readFileSync(filePath, "utf8");
      totalBytes += Buffer.byteLength(content, "utf8");
      files.push({
        path: file.path,
        content,
        size: Buffer.byteLength(content, "utf8"),
        sha256: sha256(content),
      });
    }

    const createdAtMs = Date.now();
    const checkpoint: WorkspaceCheckpoint = {
      id: checkpointId(createdAtMs, label),
      label: label.trim() || "manual checkpoint",
      projectPath: resolvedRoot,
      createdAtMs,
      fileCount: files.length,
      totalBytes,
      truncated: truncated || repositoryMap.truncated,
      files,
    };
    fs.mkdirSync(this.dir(), { recursive: true });
    fs.writeFileSync(this.path(checkpoint.id), `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
    return checkpoint;
  }

  list(limit = 30): CheckpointSummary[] {
    if (!fs.existsSync(this.dir())) return [];
    return fs.readdirSync(this.dir(), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => this.tryRead(path.basename(entry.name, ".json")))
      .filter((checkpoint): checkpoint is WorkspaceCheckpoint => Boolean(checkpoint))
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, limit)
      .map((checkpoint) => ({
        id: checkpoint.id,
        label: checkpoint.label,
        createdAtMs: checkpoint.createdAtMs,
        fileCount: checkpoint.fileCount,
        totalBytes: checkpoint.totalBytes,
        truncated: checkpoint.truncated,
      }));
  }

  read(idOrPrefix: string): WorkspaceCheckpoint {
    const id = this.resolveId(idOrPrefix);
    const checkpoint = this.tryRead(id);
    if (!checkpoint) throw new Error(`checkpoint not found: ${idOrPrefix}`);
    return checkpoint;
  }

  diff(idOrPrefix: string, targetPath?: string): CheckpointDiffSummary {
    const checkpoint = this.read(idOrPrefix);
    const lines: string[] = [];
    let changed = 0;
    let added = 0;
    let removed = 0;
    const snapshot = new Map(checkpoint.files.map((file) => [file.path, file]));
    const current = currentTextFiles(this.projectPath);
    const currentMap = new Map(current.map((file) => [file.path, file]));
    const paths = new Set([...snapshot.keys(), ...currentMap.keys()]);

    for (const filePath of [...paths].sort()) {
      if (targetPath && normalizePath(filePath) !== normalizePath(targetPath)) continue;
      const before = snapshot.get(filePath)?.content ?? "";
      const after = currentMap.get(filePath)?.content ?? "";
      if (before === after) continue;
      changed += 1;
      if (!snapshot.has(filePath)) added += 1;
      if (!currentMap.has(filePath)) removed += 1;
      try {
        const diff = createUnifiedDiff(`checkpoint/${filePath}`, before, `current/${filePath}`, after);
        const summary = summarizeDiff(diff);
        lines.push(`file ${filePath} +${summary.added} -${summary.removed}`);
        lines.push(diff);
      } catch (error) {
        lines.push(`file ${filePath}: diff unavailable (${error instanceof Error ? error.message : String(error)})`);
      }
    }

    return {
      changed,
      added,
      removed,
      diff: truncateDiff(lines.join("\n\n") || "No changes from checkpoint.", MAX_DIFF_CHARS),
    };
  }

  restore(idOrPrefix: string, options: { deleteNew?: boolean } = {}): CheckpointRestoreResult {
    const checkpoint = this.read(idOrPrefix);
    const root = path.resolve(this.projectPath);
    const snapshotPaths = new Set(checkpoint.files.map((file) => file.path));
    let restored = 0;
    let deleted = 0;
    let skipped = 0;

    for (const file of checkpoint.files) {
      const target = safeJoin(root, file.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : undefined;
      if (current === file.content) {
        skipped += 1;
        continue;
      }
      fs.writeFileSync(target, file.content, "utf8");
      restored += 1;
    }

    if (options.deleteNew) {
      for (const file of currentTextFiles(root)) {
        if (snapshotPaths.has(file.path)) continue;
        fs.rmSync(safeJoin(root, file.path), { force: true });
        deleted += 1;
      }
    }

    return { restored, deleted, skipped };
  }

  dir(): string {
    return path.join(this.projectPath, ".deepseekcode", "checkpoints");
  }

  private path(id: string): string {
    return path.join(this.dir(), `${id}.json`);
  }

  private resolveId(idOrPrefix: string): string {
    const trimmed = idOrPrefix.trim();
    if (!trimmed) throw new Error("checkpoint id is required");
    if (fs.existsSync(this.path(trimmed))) return trimmed;
    const matches = this.list(200).filter((checkpoint) => checkpoint.id.startsWith(trimmed));
    if (matches.length === 1) return matches[0]!.id;
    if (matches.length > 1) throw new Error(`checkpoint id is ambiguous: ${trimmed}`);
    return trimmed;
  }

  private tryRead(id: string): WorkspaceCheckpoint | undefined {
    const filePath = this.path(id);
    if (!fs.existsSync(filePath)) return undefined;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as WorkspaceCheckpoint;
      if (!parsed.id || !Array.isArray(parsed.files)) return undefined;
      return parsed;
    } catch {
      return undefined;
    }
  }
}

function currentTextFiles(root: string): WorkspaceCheckpointFile[] {
  const repositoryMap = buildRepositoryMap(root, 1000);
  const files: WorkspaceCheckpointFile[] = [];
  let totalBytes = 0;
  for (const file of repositoryMap.files) {
    if (!TEXT_EXTS.has(file.ext) || file.size > MAX_FILE_BYTES) continue;
    if (totalBytes + file.size > MAX_TOTAL_BYTES) break;
    const content = fs.readFileSync(safeJoin(root, file.path), "utf8");
    totalBytes += Buffer.byteLength(content, "utf8");
    files.push({
      path: file.path,
      content,
      size: Buffer.byteLength(content, "utf8"),
      sha256: sha256(content),
    });
  }
  return files;
}

function checkpointId(createdAtMs: number, label: string): string {
  const stamp = new Date(createdAtMs).toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `chk_${stamp}_${sha256(`${createdAtMs}:${label}`).slice(0, 8)}`;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizePath(value: string): string {
  return path.normalize(value).replaceAll("\\", "/");
}
