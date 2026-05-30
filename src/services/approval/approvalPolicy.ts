import { createHash } from "node:crypto";
import fs from "node:fs";
import type { Tool, ToolExecutionContext } from "../../Tool.js";
import { actionType, type ActionRequest, type ActionResult } from "../../protocol/actions.js";
import type { StateStore } from "../../state/sqlite.js";
import { safeJoin } from "../../tools/pathSafety.js";
import { createUnifiedDiff, summarizeDiff } from "../../utils/diff.js";
import { writeFileEditApprovalPreview } from "./fileEditApprovalPreview.js";

export interface ToolApprovalPolicy {
  state: StateStore;
  runId: string;
  mode: "manual";
}

const TOOL_APPROVAL_SUBJECT = "tool_action";
const APPROVAL_REQUIRED_PREFIX = "Approval required";

export function requireApprovalForToolAction(
  policy: ToolApprovalPolicy | undefined,
  tool: Tool,
  action: ActionRequest,
  context: ToolExecutionContext,
): ActionResult | undefined {
  if (!policy) return undefined;
  if (!tool.isDestructive(action)) return undefined;

  const subjectId = toolApprovalSubjectId(action);
  const existing = policy.state.listApprovalGates({
    subjectType: TOOL_APPROVAL_SUBJECT,
    subjectId,
  }, 20);
  const approved = existing.find((gate) => gate.status === "approved");
  if (approved) return undefined;

  const rejected = existing.find((gate) => gate.status === "rejected" || gate.status === "cancelled");
  if (rejected) {
    return {
      action_type: actionType(action),
      status: "failed",
      message: `Approval ${rejected.status}: ${rejected.id} ${summarizeActionForApproval(action, context)}`,
    };
  }

  const pending = existing.find((gate) => gate.status === "pending")
    ?? createPendingApproval(policy, action, subjectId, context);
  persistFileEditApprovalPreview(policy, action, pending.id, context);
  return {
    action_type: actionType(action),
    status: "failed",
    message: `${APPROVAL_REQUIRED_PREFIX}: ${pending.id} ${summarizeActionForApproval(action, context)}. Run /approval approve ${pending.id} <reason>, then retry the request.`,
  };
}

export function resultRequiresApproval(result: ActionResult): boolean {
  return result.status === "failed" && Boolean(result.message?.startsWith(APPROVAL_REQUIRED_PREFIX));
}

export function toolApprovalSubjectId(action: ActionRequest): string {
  return `tool_${createHash("sha256").update(stableStringify(action)).digest("hex").slice(0, 24)}`;
}

function createPendingApproval(
  policy: ToolApprovalPolicy,
  action: ActionRequest,
  subjectId: string,
  context: ToolExecutionContext,
) {
  const gateId = policy.state.createApprovalGate({
    runId: policy.runId,
    subjectType: TOOL_APPROVAL_SUBJECT,
    subjectId,
    summary: summarizeActionForApproval(action, context),
  });
  return policy.state.listApprovalGates({ subjectType: TOOL_APPROVAL_SUBJECT, subjectId }, 1)[0]
    ?? {
      id: gateId,
      status: "pending" as const,
    };
}

function persistFileEditApprovalPreview(
  _policy: ToolApprovalPolicy,
  action: ActionRequest,
  gateId: string,
  context: ToolExecutionContext,
): void {
  const preview = buildFileEditApprovalPreview(action, context.root);
  if (!preview) return;
  try {
    writeFileEditApprovalPreview(context.root, { gateId, ...preview });
  } catch {
    // Approval creation must not fail just because the preview sidecar cannot be written.
  }
}

function buildFileEditApprovalPreview(
  action: ActionRequest,
  root: string,
): {
  action: "write_file" | "apply_patch";
  relativePath: string;
  diff?: string;
  unavailableReason?: string;
} | null {
  try {
    if (action.type === "write_file") {
      const target = safeJoin(root, action.path);
      const previous = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
      return {
        action: "write_file",
        relativePath: action.path,
        diff: createUnifiedDiff(`a/${action.path}`, previous, `b/${action.path}`, action.content),
      };
    }

    if (action.type === "apply_patch") {
      const target = safeJoin(root, action.path);
      const previous = fs.readFileSync(target, "utf8");
      const next = applyEditsForProjection(previous, action.edits);
      return {
        action: "apply_patch",
        relativePath: action.path,
        diff: createUnifiedDiff(`a/${action.path}`, previous, `b/${action.path}`, next),
      };
    }
  } catch (error) {
    if (action.type === "write_file" || action.type === "apply_patch") {
      return {
        action: action.type,
        relativePath: action.path,
        unavailableReason: projectionError(error),
      };
    }
  }
  return null;
}

function summarizeActionForApproval(action: ActionRequest, context?: ToolExecutionContext): string {
  switch (action.type) {
    case "write_file": {
      const projection = context ? summarizeProjectedWrite(context.root, action.path, action.content) : [];
      return [
        `write_file path=${action.path}`,
        `overwrite=${action.overwrite}`,
        `chars=${action.content.length}`,
        `lines=${lineCount(action.content)}`,
        ...projection,
        `sha=${shortHash(action.content)}`,
      ].join(" ");
    }
    case "apply_patch": {
      const searchChars = action.edits.reduce((total, edit) => total + edit.search.length, 0);
      const replaceChars = action.edits.reduce((total, edit) => total + edit.replace.length, 0);
      const projection = context ? summarizeProjectedPatch(context.root, action.path, action.edits) : [];
      return [
        `apply_patch path=${action.path}`,
        `edits=${action.edits.length}`,
        `searchChars=${searchChars}`,
        `replaceChars=${replaceChars}`,
        ...projection,
        `sha=${shortHash(stableStringify(action.edits))}`,
      ].join(" ");
    }
    case "run_command":
      return `run_command command=${compact(action.command, 180)} cwd=${action.cwd || "."}`;
    case "ssh_run":
      return `ssh_run profile=${action.profile} command=${compact(action.command, 180)}`;
    case "ssh_write_file":
      return [
        `ssh_write_file profile=${action.profile}`,
        `path=${action.path}`,
        `overwrite=${action.overwrite}`,
        `chars=${action.content.length}`,
        `lines=${lineCount(action.content)}`,
        `sha=${shortHash(action.content)}`,
      ].join(" ");
    case "mcp_call":
      return [
        `mcp_call server=${action.server}`,
        `tool=${action.tool}`,
        `argumentKeys=${Object.keys(action.arguments ?? {}).length}`,
        `timeoutMs=${action.timeout_ms ?? 10000}`,
        `sha=${shortHash(stableStringify(action.arguments ?? {}))}`,
      ].join(" ");
    case "browser_session_start":
      return `browser_session_start url=${action.url} visible=${action.visible}`;
    case "browser_screenshot":
      return `browser_screenshot url=${action.url} path=${action.path} fullPage=${action.full_page}`;
    case "browser_click":
      return `browser_click url=${action.url} selector=${action.selector}`;
    case "browser_type":
      return `browser_type url=${action.url} selector=${action.selector} textChars=${action.text.length}`;
    case "create_docx":
      return `create_docx path=${action.path} markdownChars=${action.markdown.length}`;
    case "create_pdf":
      return `create_pdf path=${action.path} markdownChars=${action.markdown.length}`;
    case "computer_use":
      return `computer_use instructionChars=${action.instruction.length}`;
    default:
      return `${action.type}`;
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function compact(value: string, maxChars: number): string {
  const singleLine = value.replace(/\s+/g, " ").trim();
  return singleLine.length > maxChars ? `${singleLine.slice(0, maxChars - 3)}...` : singleLine;
}

function lineCount(value: string): number {
  if (!value) return 0;
  return value.split(/\r?\n/).length;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function summarizeProjectedWrite(root: string, relativePath: string, nextContent: string): string[] {
  try {
    const target = safeJoin(root, relativePath);
    const exists = fs.existsSync(target);
    const previous = exists ? fs.readFileSync(target, "utf8") : "";
    return summarizeProjectedTextChange(relativePath, previous, nextContent, exists);
  } catch (error) {
    return [`projected=${projectionError(error)}`];
  }
}

function summarizeProjectedPatch(
  root: string,
  relativePath: string,
  edits: Array<{ search: string; replace: string }>,
): string[] {
  try {
    const target = safeJoin(root, relativePath);
    const previous = fs.readFileSync(target, "utf8");
    const next = applyEditsForProjection(previous, edits);
    return summarizeProjectedTextChange(relativePath, previous, next, true);
  } catch (error) {
    return [`projected=${projectionError(error)}`];
  }
}

function summarizeProjectedTextChange(
  relativePath: string,
  previous: string,
  next: string,
  exists: boolean,
): string[] {
  const diff = createUnifiedDiff(`a/${relativePath}`, previous, `b/${relativePath}`, next);
  const summary = summarizeDiff(diff);
  return [
    "projected=ok",
    `exists=${exists}`,
    `oldLines=${lineCount(previous)}`,
    `newLines=${lineCount(next)}`,
    `added=${summary.added}`,
    `removed=${summary.removed}`,
  ];
}

function applyEditsForProjection(
  content: string,
  edits: Array<{ search: string; replace: string }>,
): string {
  let next = content;
  for (const edit of edits) {
    const count = countOccurrences(next, edit.search);
    if (count === 0) throw new Error("missing_search");
    if (count > 1) throw new Error("ambiguous_search");
    next = next.replace(edit.search, edit.replace);
  }
  return next;
}

function countOccurrences(text: string, search: string): number {
  let count = 0;
  let index = 0;
  while (true) {
    const found = text.indexOf(search, index);
    if (found === -1) return count;
    count += 1;
    index = found + search.length;
  }
}

function projectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/too large/i.test(message)) return "too_large";
  if (/missing_search|not found/i.test(message)) return "missing_search";
  if (/ambiguous_search|ambiguous/i.test(message)) return "ambiguous_search";
  if (/ENOENT/i.test(message)) return "missing_file";
  return "unavailable";
}
