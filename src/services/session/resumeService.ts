import type { StateStore } from "../../state/sqlite.js";
import { SessionStorage, type TranscriptRecord } from "./sessionStorage.js";
import { getSessionTags, getSessionTitle } from "./sessionMetadata.js";

export interface ResumeSessionPreview {
  sessionId: string;
  title?: string;
  tags?: string[];
  records: TranscriptRecord[];
}

export function resumeSession(
  state: StateStore,
  dataDir: string,
  projectPath: string,
  sessionId: string,
  limit = 24,
): ResumeSessionPreview {
  const records = new SessionStorage(dataDir, sessionId).readAll(limit);
  if (records.length === 0) {
    throw new Error(`No transcript records for ${sessionId}.`);
  }
  state.setUiState(sessionScope(projectPath), "current_session_id", sessionId);
  state.appendEvent(null, "session_resumed", { session_id: sessionId, project_path: projectPath });
  return {
    sessionId,
    title: getSessionTitle(dataDir, sessionId),
    tags: getSessionTags(dataDir, sessionId),
    records,
  };
}

export function getCurrentSessionId(state: StateStore, projectPath: string): string | undefined {
  return state.getUiState<string>(sessionScope(projectPath), "current_session_id");
}

export function setCurrentSessionId(state: StateStore, projectPath: string, sessionId: string): void {
  state.setUiState(sessionScope(projectPath), "current_session_id", sessionId);
}

export function clearCurrentSession(state: StateStore, projectPath: string): void {
  state.deleteUiState(sessionScope(projectPath), "current_session_id");
}

export function formatResumeSessionPreview(preview: ResumeSessionPreview): string {
  return [
    `resumed session: ${preview.sessionId}${preview.title ? ` (${preview.title})` : ""}${preview.tags?.length ? ` ${preview.tags.map((tag) => `#${tag}`).join(" ")}` : ""}`,
    ...preview.records.map((record) => `${record.role}: ${firstLine(record.text)}`),
  ].join("\n");
}

function sessionScope(projectPath: string): string {
  return `session:${projectPath}`;
}

function firstLine(value: string): string {
  const line = value.split(/\r?\n/)[0]?.trim() ?? "";
  return line.length > 180 ? `${line.slice(0, 177)}...` : line;
}
