import fs from "node:fs";
import path from "node:path";
import type { RuntimeConfig } from "../../bootstrap/config.js";
import { SessionStorage, type TranscriptRecord } from "../session/sessionStorage.js";
import type { RuntimePermissionState } from "../permissions/permissionProfiles.js";
import { buildProjectStatus, formatProjectStatus } from "../status/projectStatus.js";
import type { StateStore } from "../../state/sqlite.js";
import { safeJoin } from "../../tools/pathSafety.js";

export type ExportFormat = "markdown" | "json";

export interface ExportResult {
  path: string;
  bytes: number;
  format: ExportFormat;
}

export function exportRunTrace(
  projectPath: string,
  state: StateStore,
  runId: string,
  targetPath: string,
  format: ExportFormat,
): ExportResult {
  const trace = state.traceRun(runId);
  return writeExport(projectPath, targetPath, format, format === "json"
    ? JSON.stringify(trace, null, 2)
    : renderRunTraceMarkdown(runId, trace));
}

export function exportSessionTranscript(
  projectPath: string,
  dataDir: string,
  sessionId: string,
  targetPath: string,
  format: ExportFormat,
): ExportResult {
  const records = new SessionStorage(dataDir, sessionId).readAll(1000);
  return writeExport(projectPath, targetPath, format, format === "json"
    ? JSON.stringify(records, null, 2)
    : renderTranscriptMarkdown(sessionId, records));
}

export function exportStatusSnapshot(
  config: RuntimeConfig,
  state: StateStore,
  permissions: RuntimePermissionState,
  targetPath: string,
  format: ExportFormat,
): ExportResult {
  const status = buildProjectStatus(config, state, permissions);
  return writeExport(config.projectPath, targetPath, format, format === "json"
    ? JSON.stringify(status, null, 2)
    : `# DeepSeekCode Status\n\n\`\`\`text\n${formatProjectStatus(status)}\n\`\`\`\n`);
}

export function inferExportFormat(targetPath: string): ExportFormat {
  return path.extname(targetPath).toLowerCase() === ".json" ? "json" : "markdown";
}

export function defaultExportPath(kind: "run" | "session" | "status", id = ""): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const suffix = id ? `-${sanitizeFilename(id)}` : "";
  return path.posix.join(".deepseekcode", "exports", `${kind}-${stamp}${suffix}.md`);
}

function writeExport(
  projectPath: string,
  targetPath: string,
  format: ExportFormat,
  content: string,
): ExportResult {
  const target = safeJoin(projectPath, targetPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
  return {
    path: target,
    bytes: Buffer.byteLength(content, "utf8"),
    format,
  };
}

function renderRunTraceMarkdown(runId: string, trace: unknown): string {
  return [
    `# DeepSeekCode Run Trace`,
    "",
    `Run: \`${runId}\``,
    "",
    "```json",
    JSON.stringify(trace, null, 2),
    "```",
    "",
  ].join("\n");
}

function renderTranscriptMarkdown(sessionId: string, records: TranscriptRecord[]): string {
  const lines = [`# DeepSeekCode Session`, "", `Session: \`${sessionId}\``, ""];
  for (const record of records) {
    lines.push(`## ${record.role}`);
    lines.push("");
    lines.push(record.text || " ");
    lines.push("");
  }
  return lines.join("\n");
}

function sanitizeFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
