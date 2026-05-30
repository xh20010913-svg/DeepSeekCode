import fs from "node:fs";
import path from "node:path";

export interface SessionMetadata {
  sessionId: string;
  title: string;
  tags?: string[];
  updatedAtMs: number;
}

export function setSessionTitle(dataDir: string, sessionId: string, title: string): SessionMetadata {
  const metadata = readAllMetadata(dataDir);
  const previous = metadata[sessionId];
  const record: SessionMetadata = {
    sessionId,
    title: title.trim(),
    tags: previous?.tags ?? [],
    updatedAtMs: Date.now(),
  };
  metadata[sessionId] = record;
  writeAllMetadata(dataDir, metadata);
  return record;
}

export function getSessionTitle(dataDir: string, sessionId: string): string | undefined {
  return readAllMetadata(dataDir)[sessionId]?.title;
}

export function listSessionTitles(dataDir: string): Record<string, SessionMetadata> {
  return readAllMetadata(dataDir);
}

export function toggleSessionTag(dataDir: string, sessionId: string, tag: string): SessionMetadata {
  const normalized = normalizeSessionTag(tag);
  if (!normalized) throw new Error("tag name cannot be empty");
  const metadata = readAllMetadata(dataDir);
  const previous = metadata[sessionId];
  const tags = new Set(previous?.tags ?? []);
  if (tags.has(normalized)) {
    tags.delete(normalized);
  } else {
    tags.add(normalized);
  }
  const record: SessionMetadata = {
    sessionId,
    title: previous?.title ?? "",
    tags: [...tags].sort(),
    updatedAtMs: Date.now(),
  };
  metadata[sessionId] = record;
  writeAllMetadata(dataDir, metadata);
  return record;
}

export function setSessionTags(dataDir: string, sessionId: string, tags: string[]): SessionMetadata {
  const metadata = readAllMetadata(dataDir);
  const previous = metadata[sessionId];
  const normalized = Array.from(new Set(tags.map(normalizeSessionTag).filter(Boolean) as string[])).sort();
  const record: SessionMetadata = {
    sessionId,
    title: previous?.title ?? "",
    tags: normalized,
    updatedAtMs: Date.now(),
  };
  metadata[sessionId] = record;
  writeAllMetadata(dataDir, metadata);
  return record;
}

export function getSessionTags(dataDir: string, sessionId: string): string[] {
  return readAllMetadata(dataDir)[sessionId]?.tags ?? [];
}

export function normalizeSessionTag(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function metadataPath(dataDir: string): string {
  return path.join(dataDir, "sessions", "metadata.json");
}

function readAllMetadata(dataDir: string): Record<string, SessionMetadata> {
  const filePath = metadataPath(dataDir);
  if (!fs.existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, SessionMetadata>;
    return Object.fromEntries(Object.entries(parsed).map(([sessionId, record]) => [
      sessionId,
      {
        sessionId: record.sessionId ?? sessionId,
        title: record.title ?? "",
        tags: Array.isArray(record.tags) ? record.tags.map(normalizeSessionTag).filter(Boolean) : [],
        updatedAtMs: Number(record.updatedAtMs ?? 0),
      },
    ]));
  } catch {
    return {};
  }
}

function writeAllMetadata(dataDir: string, metadata: Record<string, SessionMetadata>): void {
  const filePath = metadataPath(dataDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), "utf8");
}
