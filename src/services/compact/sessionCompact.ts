import type { ChatMessage } from "../../protocol/provider.js";
import { SessionStorage, type TranscriptRecord } from "../session/sessionStorage.js";
import { buildContextCapsuleFromRecords, formatContextCapsule } from "./contextCapsule.js";

export interface SessionCompactSummary {
  sessionId: string;
  totalRecords: number;
  summarizedRecords: number;
  tailRecords: TranscriptRecord[];
  summary: string;
}

export function compactSessionTranscript(
  dataDir: string,
  sessionId: string,
  keepTail = 12,
): SessionCompactSummary {
  const records = new SessionStorage(dataDir, sessionId).readAll(1000);
  const chatMessages = records
    .filter((record) => record.role === "user" || record.role === "assistant" || record.role === "system")
    .map((record): ChatMessage => ({
      role: record.role === "user" ? "user" : record.role === "assistant" ? "assistant" : "system",
      content: record.text,
    }));
  void chatMessages;
  const capsule = buildContextCapsuleFromRecords(records.slice(0, Math.max(0, records.length - keepTail)));
  return {
    sessionId,
    totalRecords: records.length,
    summarizedRecords: Math.max(0, records.length - keepTail),
    tailRecords: records.slice(-keepTail),
    summary: formatContextCapsule(capsule),
  };
}

export function formatSessionCompactSummary(summary: SessionCompactSummary): string {
  return [
    `session: ${summary.sessionId}`,
    `records: total=${summary.totalRecords} summarized=${summary.summarizedRecords} tail=${summary.tailRecords.length}`,
    "summary:",
    summary.summary.trim() || "(not enough transcript records to compact)",
    "tail:",
    ...summary.tailRecords.map((record) => `${record.role}: ${firstLine(record.text)}`),
  ].join("\n");
}

function firstLine(value: string): string {
  const line = value.split(/\r?\n/)[0]?.trim() ?? "";
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}
