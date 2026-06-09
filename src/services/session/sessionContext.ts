import type { ChatMessage } from "../../protocol/provider.js";
import type { TranscriptRecord } from "./sessionStorage.js";
import { sanitizeLegacyPlannerContext } from "./legacyContextSanitizer.js";
import { buildContextCapsuleFromRecords, formatContextCapsule } from "../compact/contextCapsule.js";

export interface SessionContextBuildOptions {
  keepTailMessages?: number;
  maxSummaryChars?: number;
  maxSelectedRecords?: number;
}

export interface BuiltSessionContext {
  history: ChatMessage[];
  summary: string;
  selectedRecords: TranscriptRecord[];
  totalRecords: number;
}

export function buildSessionContext(
  records: TranscriptRecord[],
  options: SessionContextBuildOptions = {},
): BuiltSessionContext {
  const keepTailMessages = options.keepTailMessages ?? 10;
  const maxSummaryChars = options.maxSummaryChars ?? 5000;
  const maxSelectedRecords = options.maxSelectedRecords ?? 28;
  const chatRecords = records.filter(isChatRecord);
  const tailRecords = chatRecords.slice(-keepTailMessages);
  const tailIds = new Set(tailRecords.map((record) => record.id));
  const olderRecords = records.filter((record) => !tailIds.has(record.id));

  const selectedRecords = olderRecords
    .map((record, index) => ({
      record,
      index,
      score: scoreTranscriptRecord(record, index, records.length),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, maxSelectedRecords)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.record);

  const capsule = buildContextCapsuleFromRecords(dedupeSummaryRecords(selectedRecords), {
    maxItemsPerSection: 6,
    maxItemChars: 260,
  });
  const summary = formatContextCapsule(capsule).slice(-maxSummaryChars).trim();

  return {
    history: tailRecords.map(recordToChatMessage),
    summary,
    selectedRecords,
    totalRecords: records.length,
  };
}

function dedupeSummaryRecords(records: TranscriptRecord[]): TranscriptRecord[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = summaryDedupeKey(record);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summaryDedupeKey(record: TranscriptRecord): string | undefined {
  const text = record.text ?? "";
  if (/tdai_memory_search\s+succeeded/i.test(text)) return "tool:tdai_memory_search:succeeded";
  if (/tdai_conversation_search\s+succeeded/i.test(text)) return "tool:tdai_conversation_search:succeeded";
  return undefined;
}

export function scoreTranscriptRecord(record: TranscriptRecord, index = 0, total = 1): number {
  const text = record.text ?? "";
  const recency = Math.max(0, Math.min(20, index === total - 1 ? 20 : 20 - Math.floor((total - index) / 4)));
  let score = recency;
  if (record.role === "error") score += 120;
  if (record.role === "tool") score += 45;
  if (record.role === "user") score += 70;
  if (record.role === "assistant") score += 35;
  if (record.role === "system") score += /resume|compact|validation|approval|cache|session/i.test(text) ? 30 : -20;
  if (/failed|error|exception|traceback|stderr|失败|错误|异常|未通过|阻塞|缺少|无法|报错/i.test(text)) score += 90;
  if (/\b[\w./\\-]+\.(ts|tsx|js|mjs|json|md|html|docx|pptx|pdf|py|css)\b/i.test(text)) score += 45;
  if (/write_file|apply_patch|run_command|validate_artifact|verify_task|create_docx|create_pptx|create_pdf|artifact|产物|验证|验收/i.test(text)) {
    score += 45;
  }
  if (/todo|remaining|continue|下一步|继续|未完成|待办|修复|完善/i.test(text)) score += 35;
  return Math.max(0, score);
}

function isChatRecord(record: TranscriptRecord): boolean {
  return record.role === "user" || record.role === "assistant" || record.role === "system";
}

function recordToChatMessage(record: TranscriptRecord): ChatMessage {
  return {
    role: record.role === "assistant" ? "assistant" : record.role === "system" ? "system" : "user",
    content: sanitizeLegacyPlannerContext(record.text),
  };
}

function formatSummaryRecord(record: TranscriptRecord): string {
  const text = compact(sanitizeLegacyPlannerContext(record.text), record.role === "tool" || record.role === "error" ? 900 : 520);
  if (!text) return "";
  return `- ${record.role}${record.runId ? ` run=${record.runId}` : ""}: ${text}`;
}

function compact(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 28)).trimEnd()} ... [truncated]`;
}
