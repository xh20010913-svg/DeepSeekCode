import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface FileSnapshot {
  path: string;
  sha256: string;
  size: number;
  mtimeMs: number;
  readAtMs: number;
}

export class FileStateCache {
  private readonly snapshots = new Map<string, FileSnapshot>();

  rememberRead(projectRoot: string, filePath: string): FileSnapshot {
    const snapshot = snapshotFile(projectRoot, filePath);
    this.snapshots.set(normalizeKey(filePath), snapshot);
    return snapshot;
  }

  get(filePath: string): FileSnapshot | undefined {
    return this.snapshots.get(normalizeKey(filePath));
  }

  checkFresh(projectRoot: string, filePath: string): { fresh: true } | { fresh: false; reason: string } {
    const prior = this.get(filePath);
    if (!prior) {
      return { fresh: false, reason: "file was not read in this session before write/patch" };
    }
    const current = snapshotFile(projectRoot, filePath);
    if (current.sha256 !== prior.sha256) {
      return { fresh: false, reason: "file changed after last read" };
    }
    return { fresh: true };
  }

  checkFreshForWrite(projectRoot: string, filePath: string): { fresh: true } | { fresh: false; reason: string } {
    const fullPath = path.resolve(projectRoot, filePath);
    if (!fs.existsSync(fullPath)) return { fresh: true };
    return this.checkFresh(projectRoot, filePath);
  }
}

export function snapshotFile(projectRoot: string, filePath: string): FileSnapshot {
  const fullPath = path.resolve(projectRoot, filePath);
  const stat = fs.statSync(fullPath);
  const content = fs.readFileSync(fullPath);
  return {
    path: filePath.replaceAll("\\", "/"),
    sha256: crypto.createHash("sha256").update(content).digest("hex"),
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    readAtMs: Date.now(),
  };
}

function normalizeKey(filePath: string): string {
  return filePath.replaceAll("\\", "/").toLowerCase();
}
