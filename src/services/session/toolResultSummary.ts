import type { ActionExecutionReport, ActionResult } from "../../protocol/actions.js";

export interface ToolResultSummaryOptions {
  attempt?: number;
  runId?: string;
  note?: string;
  maxResults?: number;
  maxMessageChars?: number;
  maxContextChars?: number;
}

export function compactActionReport(
  report: ActionExecutionReport,
  options: Pick<ToolResultSummaryOptions, "maxResults" | "maxMessageChars" | "maxContextChars"> = {},
): ActionExecutionReport {
  const maxResults = options.maxResults ?? 8;
  const maxMessageChars = options.maxMessageChars ?? 420;
  const important = [...report.results]
    .map((result, index) => ({ result, index, score: scoreActionResult(result, index, report.results.length) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, maxResults)
    .sort((a, b) => a.index - b.index);

  const omitted = Math.max(0, report.results.length - important.length);
  const maxContextChars = options.maxContextChars ?? 1600;
  const compactResults = important.map(({ result }) => compactActionResult(result, maxMessageChars, maxContextChars));
  if (omitted > 0) {
    compactResults.push({
      action_type: "tool_result_summary",
      status: report.status,
      message: `${omitted} lower-priority tool result(s) omitted from prompt context; full run trace remains in local state.`,
    });
  }

  return {
    status: report.status,
    final_message: compactText(report.final_message, 520),
    results: compactResults,
  };
}

export function formatToolResultSummary(
  report: ActionExecutionReport,
  options: ToolResultSummaryOptions = {},
): string {
  const compact = compactActionReport(report, options);
  const header = [
    "tool_result_summary",
    options.runId ? `run=${options.runId}` : "",
    options.attempt ? `attempt=${options.attempt}` : "",
    `status=${compact.status}`,
  ].filter(Boolean).join(" ");
  const lines = [
    header,
    compact.final_message ? `final: ${compact.final_message}` : "",
    ...compact.results.map((result, index) => formatActionResult(result, index + 1)),
    options.note ? `note: ${compactText(options.note, 500)}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

export function scoreActionResult(result: ActionResult, index = 0, total = 1): number {
  let score = Math.max(0, Math.min(20, index === total - 1 ? 12 : 20 - index));
  if (result.status === "failed") score += 100;
  if (result.path) score += 30;
  if (result.artifact_kind) score += 25;
  if (/validate|test|lint|typecheck|build|artifact/i.test(result.action_type)) score += 35;
  if (/run_command|ssh_run|mcp_call/i.test(result.action_type)) score += 30;
  if (/write_file|apply_patch|create_docx|create_pptx|create_pdf/i.test(result.action_type)) score += 40;
  if (result.message && /error|failed|exception|traceback|stderr|失败|错误|异常|未通过|阻塞|缺少|无法|报错/i.test(result.message)) {
    score += 55;
  }
  return score;
}

function compactActionResult(result: ActionResult, maxMessageChars: number, maxContextChars: number): ActionResult {
  return {
    action_type: result.action_type,
    status: result.status,
    path: result.path,
    artifact_kind: result.artifact_kind,
    message: result.message ? compactText(sanitizeToolMessage(result.message), maxMessageChars) : result.message,
    context: result.context ? compactPreserveLines(result.context, maxContextChars) : undefined,
  };
}

function formatActionResult(result: ActionResult, index: number): string {
  const target = result.path ? ` path=${result.path}` : "";
  const kind = result.artifact_kind ? ` kind=${result.artifact_kind}` : "";
  const message = result.message ? ` message=${compactText(result.message, 360)}` : "";
  const context = result.context ? ` context=${compactText(result.context, 360)}` : "";
  return `${index}. ${result.action_type} ${result.status}${target}${kind}${message}${context}`;
}

function compactText(value: string | undefined, max: number): string {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 32)).trimEnd()} ... [truncated ${normalized.length - max} chars]`;
}

function compactPreserveLines(value: string, max: number): string {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (normalized.length <= max) return normalized;
  const headChars = Math.floor(max * 0.7);
  const tailChars = Math.max(0, max - headChars - 80);
  return [
    normalized.slice(0, headChars).trimEnd(),
    `\n... [tool context truncated ${normalized.length - max} chars] ...\n`,
    normalized.slice(-tailChars).trimStart(),
  ].join("");
}

function sanitizeToolMessage(message: string): string {
  if (/Invalid arguments for tool/i.test(message) && /\braw=/.test(message)) {
    return `${message.split(/\braw=/, 1)[0].trim()} raw tool arguments omitted from prompt context; inspect local prompt audit or run trace for full payload.`;
  }
  if (/Unterminated string in JSON/i.test(message) && /\braw=/.test(message)) {
    return `${message.split(/\braw=/, 1)[0].trim()} raw tool arguments omitted from prompt context; inspect local prompt audit or run trace for full payload.`;
  }
  return message;
}
