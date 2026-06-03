import type { Tool, Tools } from "../../Tool.js";
import {
  ActionRequestSchema,
  type ActionExecutionReport,
  type ActionRequest,
  type ActionResult,
} from "../../protocol/actions.js";
import type { ActionPlanTurn } from "../../protocol/provider.js";

export interface NativeFunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JsonSchemaObject;
  };
}

export interface NativeToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export type NativeChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: NativeToolCall[];
    }
  | {
      role: "tool";
      tool_call_id: string;
      content: string;
    };

interface JsonSchemaObject {
  type: "object";
  properties: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
}

type JsonSchema =
  | { type: "string"; description?: string; enum?: string[] }
  | { type: "boolean"; description?: string; default?: boolean }
  | { type: "number" | "integer"; description?: string; minimum?: number; maximum?: number; default?: number }
  | { type: "array"; description?: string; items: JsonSchema; minItems?: number; maxItems?: number }
  | JsonSchemaObject;

export function nativeToolCallingEnabled(): boolean {
  const value = process.env.DEEPSEEKCODE_TOOL_CALLING?.trim().toLowerCase();
  return value !== "0" && value !== "false" && value !== "off" && value !== "json";
}

export function toNativeFunctionTools(tools: Tools): NativeFunctionTool[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: parametersForTool(tool),
    },
  }));
}

export function toolCallsToActions(toolCalls: NativeToolCall[]): ActionRequest[] {
  return toolCalls.map((call) => {
    const args = parseToolArguments(call);
    const candidate = {
      type: call.function.name,
      ...args,
    };
    return ActionRequestSchema.parse(candidate);
  });
}

export function envelopeActionsToToolCalls(turn: ActionPlanTurn): NativeToolCall[] {
  return turn.assistantEnvelope.actions.map((action, index) => ({
    id: toolCallId(turn.attempt, index),
    type: "function",
    function: {
      name: action.type,
      arguments: JSON.stringify(stripActionType(action)),
    },
  }));
}

export function reportToToolMessages(turn: ActionPlanTurn): NativeChatMessage[] {
  return turn.toolReport.results.map((result, index) => ({
    role: "tool",
    tool_call_id: toolCallId(turn.attempt, index),
    content: compactToolResult(result, turn.toolReport, turn.note),
  }));
}

export function feedbackToUserMessage(feedback: ActionExecutionReport): string {
  return [
    "Tool result feedback from the local runtime:",
    feedback.final_message ? `final_message: ${feedback.final_message}` : "",
    `status: ${feedback.status}`,
    ...feedback.results.map((result, index) =>
      `${index + 1}. ${result.action_type} ${result.status}${result.path ? ` path=${result.path}` : ""}${result.message ? ` message=${compact(result.message, 1000)}` : ""}`,
    ),
    "Continue from this feedback. Use the next useful native tool call, or answer finally if the task is complete.",
  ].filter(Boolean).join("\n");
}

function parametersForTool(tool: Tool): JsonSchemaObject {
  const schema = TOOL_PARAMETER_SCHEMAS[tool.name];
  if (schema) return schema;
  return objectSchema({}, [], true);
}

function parseToolArguments(call: NativeToolCall): Record<string, unknown> {
  const raw = call.function.arguments?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("arguments must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid arguments for tool ${call.function.name}: ${message}; ${malformedArgumentGuidance(call.function.name)} raw=${compact(raw, 400)}`);
  }
}

function stripActionType(action: ActionRequest): Record<string, unknown> {
  const { type: _type, ...rest } = action as unknown as Record<string, unknown>;
  return rest;
}

function toolCallId(attempt: number, index: number): string {
  return `call_${attempt}_${index}`;
}

function compactToolResult(result: ActionResult, report: ActionExecutionReport, note?: string): string {
  return [
    `action=${result.action_type}`,
    `status=${result.status}`,
    result.path ? `path=${result.path}` : "",
    result.artifact_kind ? `artifact_kind=${result.artifact_kind}` : "",
    result.message ? `message=${compact(result.message, 4000)}` : "",
    result.context ? `context:\n${compactPreserveLines(result.context, 12000)}` : "",
    note ? `note=${compact(note, 1000)}` : "",
    report.final_message ? `batch=${compact(report.final_message, 1000)}` : "",
  ].filter(Boolean).join("\n");
}

function compact(text: string, max: number): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

function compactPreserveLines(text: string, max: number): string {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (normalized.length <= max) return normalized;
  const headChars = Math.floor(max * 0.7);
  const tailChars = Math.max(0, max - headChars - 80);
  return [
    normalized.slice(0, headChars).trimEnd(),
    `\n... [tool context truncated ${normalized.length - max} chars] ...\n`,
    normalized.slice(-tailChars).trimStart(),
  ].join("");
}

function objectSchema(
  properties: Record<string, JsonSchema>,
  required: string[] = [],
  additionalProperties: boolean | JsonSchema = false,
): JsonSchemaObject {
  return {
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties,
  };
}

function string(description?: string, values?: string[]): JsonSchema {
  return values?.length ? { type: "string", description, enum: values } : { type: "string", description };
}

function bool(description?: string, defaultValue?: boolean): JsonSchema {
  return { type: "boolean", description, default: defaultValue };
}

function integer(description?: string, minimum?: number, maximum?: number, defaultValue?: number): JsonSchema {
  return { type: "integer", description, minimum, maximum, default: defaultValue };
}

function array(items: JsonSchema, description?: string, minItems?: number, maxItems?: number): JsonSchema {
  return { type: "array", description, items, minItems, maxItems };
}

const artifactKinds = ["file", "html", "markdown", "docx", "pptx", "pdf", "image", "screenshot"];

const TOOL_PARAMETER_SCHEMAS: Record<string, JsonSchemaObject> = {
  read_file: objectSchema({
    path: string("Project-relative path to read."),
    encoding: string("Text encoding; normally utf-8."),
  }, ["path"]),
  list_files: objectSchema({
    path: string("Project-relative directory to list. Empty means project root."),
    max_depth: integer("Recursive depth limit.", 1, 12, 2),
  }),
  write_file: objectSchema({
    path: string("Project-relative file path to write."),
    content: string("Complete compact file content. For large artifacts, write a compact first section and continue with append_file chunks. Keep the final assembled file valid for its target language or document format."),
    content_lines: array(string("One line of file content."), "Lines joined by the runtime with newline characters. Keep this compact; use append_file for large artifacts.", undefined, 80),
    encoding: string("Text encoding; normally utf-8."),
    overwrite: bool("Overwrite an existing file. Requires a fresh read for stale-write safety.", false),
  }, ["path"]),
  append_file: objectSchema({
    path: string("Project-relative file path to append to."),
    content: string("Compact text chunk to append. Keep each chunk small enough for valid JSON tool arguments and preserve final file syntax."),
    content_lines: array(string("One appended line."), "Lines joined by the runtime with newline characters. Keep each chunk compact.", undefined, 80),
    encoding: string("Text encoding; normally utf-8."),
    create: bool("Create the file if it does not exist. Prefer write_file for the initial skeleton.", false),
  }, ["path"]),
  glob_files: objectSchema({
    path: string("Project-relative search root."),
    pattern: string("Wildcard pattern such as **/*.ts."),
    max_results: integer("Maximum matches to return.", 1, 1000, 200),
  }, ["pattern"]),
  grep_files: objectSchema({
    path: string("Project-relative search root."),
    pattern: string("Regular expression to search for."),
    include: string("Optional include wildcard such as **/*.ts."),
    max_results: integer("Maximum matches to return.", 1, 1000, 100),
  }, ["pattern"]),
  apply_patch: objectSchema({
    path: string("Project-relative file to patch."),
    edits: array(objectSchema({
      search: string("Exact existing text to replace."),
      replace: string("Replacement text."),
    }, ["search", "replace"]), "Exact search/replace edits.", 1),
    encoding: string("Text encoding; normally utf-8."),
  }, ["path", "edits"]),
  run_command: objectSchema({
    command: string("Shell command to run in the project."),
    cwd: string("Optional project-relative working directory."),
    timeout_ms: integer("Timeout in milliseconds.", 100, 120000, 30000),
  }, ["command"]),
  ssh_run: objectSchema({
    profile: string("SSH profile name."),
    command: string("Remote shell command."),
    timeout_ms: integer("Timeout in milliseconds.", 100, 120000, 30000),
  }, ["profile", "command"]),
  ssh_read_file: objectSchema({
    profile: string("SSH profile name."),
    path: string("Remote path to read."),
    encoding: string("Text encoding; normally utf-8."),
    timeout_ms: integer("Timeout in milliseconds.", 100, 120000, 30000),
  }, ["profile", "path"]),
  ssh_write_file: objectSchema({
    profile: string("SSH profile name."),
    path: string("Remote path to write."),
    content: string("Complete file content."),
    content_lines: array(string("One line of file content."), "Lines joined by newline characters."),
    encoding: string("Text encoding; normally utf-8."),
    overwrite: bool("Overwrite an existing remote file.", false),
    timeout_ms: integer("Timeout in milliseconds.", 100, 120000, 30000),
  }, ["profile", "path"]),
  mcp_call: objectSchema({
    server: string("MCP server name."),
    tool: string("MCP tool name."),
    arguments: objectSchema({}, [], true),
    timeout_ms: integer("Timeout in milliseconds.", 100, 120000, 10000),
  }, ["server", "tool"]),
  tdai_memory_search: objectSchema({
    query: string("Search query for TencentDB-Agent-Memory L1 structured long-term memories."),
    limit: integer("Maximum memory results.", 1, 20, 5),
    memory_type: string("Optional memory type filter.", ["persona", "episodic", "instruction"]),
    scene: string("Optional scene name filter."),
  }, ["query"]),
  tdai_conversation_search: objectSchema({
    query: string("Search query for TencentDB-Agent-Memory L0 raw conversation history."),
    limit: integer("Maximum conversation results.", 1, 20, 5),
    session_key: string("Optional TDAI session key filter."),
  }, ["query"]),
  TodoWrite: objectSchema({
    scope: string("Todo scope, normally project."),
    todos: array(objectSchema({
      id: string("Optional stable todo id."),
      content: string("Todo text."),
      activeForm: string("Present participle form, such as Running tests."),
      status: string("Todo status.", ["pending", "in_progress", "completed"]),
    }, ["content", "status"]), "Todos to replace the current todo list.", 1),
  }, ["todos"]),
  EnterPlanMode: objectSchema({
    goal: string("Optional planning goal."),
    run_id: string("Optional current run id."),
  }),
  AskUserQuestion: objectSchema({
    questions: array(objectSchema({
      question: string("Question text."),
      header: string("Short label."),
      options: array(objectSchema({
        label: string("Option label."),
        description: string("Option description."),
        preview: string("Optional preview."),
      }, ["label", "description"]), "Choices.", 2, 4),
      multiSelect: bool("Whether multiple options can be selected.", false),
    }, ["question", "header", "options"]), "Questions.", 1, 4),
    run_id: string("Optional current run id."),
  }, ["questions"]),
  ExitPlanMode: objectSchema({
    plan: string("Markdown plan."),
    summary: string("Short summary."),
    run_id: string("Optional current run id."),
  }, ["plan"]),
  validate_artifact: objectSchema({
    path: string("Project-relative artifact path."),
    expected_kind: string("Expected artifact kind.", artifactKinds),
  }, ["path"]),
  browser_session_start: objectSchema({
    url: string("URL to open."),
    visible: bool("Whether the browser should be visible.", true),
  }, ["url"]),
  browser_snapshot: objectSchema({
    url: string("URL to inspect."),
  }, ["url"]),
  browser_screenshot: objectSchema({
    url: string("URL to capture."),
    path: string("Project-relative screenshot output path."),
    full_page: bool("Capture the full page.", false),
  }, ["url", "path"]),
  browser_click: objectSchema({
    url: string("URL of the page."),
    selector: string("CSS selector to click."),
  }, ["url", "selector"]),
  browser_type: objectSchema({
    url: string("URL of the page."),
    selector: string("CSS selector to type into."),
    text: string("Text to type."),
  }, ["url", "selector", "text"]),
  create_docx: objectSchema({
    path: string("Project-relative DOCX output path."),
    markdown: string("Markdown source to convert to DOCX. Use markdown_lines for long or multiline documents."),
    markdown_lines: array(string("One Markdown line."), "Markdown lines joined by the runtime with newline characters. Prefer this for reports and long documents."),
  }, ["path"]),
  create_pptx: objectSchema({
    path: string("Project-relative PPTX output path."),
    title: string("Deck title."),
    subtitle: string("Optional deck subtitle."),
    slides: array(objectSchema({
      title: string("Slide title."),
      bullets: array(string("Bullet text."), "Slide bullets."),
      speaker_notes: string("Optional speaker notes."),
      visual: string("Optional visual direction."),
    }, ["title"]), "Slides.", 1, 20),
  }, ["path", "title", "slides"]),
  create_pdf: objectSchema({
    path: string("Project-relative PDF output path."),
    markdown: string("Markdown source to convert to PDF. Use markdown_lines for long or multiline documents."),
    markdown_lines: array(string("One Markdown line."), "Markdown lines joined by newline characters."),
  }, ["path"]),
  computer_use: objectSchema({
    instruction: string("Computer-use instruction for the bridge."),
  }, ["instruction"]),
  invoke_skill: objectSchema({
    name: string("Skill name to invoke."),
    task: string("Task for the skill sub-agent."),
    max_turns: integer("Maximum skill turns.", 1, 6, 3),
  }, ["name", "task"]),
  invoke_agent: objectSchema({
    name: string("Agent name to invoke."),
    task: string("Task for the sub-agent."),
  }, ["name", "task"]),
};

function malformedArgumentGuidance(toolName: string): string {
  if (toolName === "write_file" || toolName === "append_file" || toolName === "ssh_write_file") {
    return [
      "Large or multiline text was not valid JSON.",
      "Retry with smaller native tool calls: write a compact skeleton first, then use append_file chunks under about 1200 characters, then validate_artifact.",
    ].join(" ");
  }
  return "Retry with valid JSON arguments for the native function schema.";
}
