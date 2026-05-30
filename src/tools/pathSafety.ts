import path from "node:path";

export class PathSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathSafetyError";
  }
}

export function safeJoin(root: string, relativePath: string): string {
  const trimmed = relativePath.trim();
  if (!trimmed) {
    throw new PathSafetyError("path is empty");
  }
  if (path.isAbsolute(trimmed)) {
    throw new PathSafetyError(`absolute paths are not allowed: ${trimmed}`);
  }

  const normalized = path.normalize(trimmed);
  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  if (parts.includes("..")) {
    throw new PathSafetyError(`path traversal is not allowed: ${relativePath}`);
  }

  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, normalized);
  const relative = path.relative(resolvedRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new PathSafetyError(`path escapes project root: ${relativePath}`);
  }

  return target;
}

export function safeOptionalJoin(root: string, relativePath: string): string {
  if (!relativePath.trim()) return path.resolve(root);
  return safeJoin(root, relativePath);
}
