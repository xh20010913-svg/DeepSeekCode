import { z } from "zod";

export const ArtifactKindSchema = z.enum([
  "file",
  "html",
  "markdown",
  "docx",
  "pptx",
  "pdf",
  "image",
  "screenshot",
]);

export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

export const WriteFileActionSchema = z.object({
  type: z.literal("write_file"),
  path: z.string().min(1),
  content: z.string().optional(),
  content_lines: z.array(z.string()).optional(),
  encoding: z.string().default("utf-8"),
  overwrite: z.boolean().default(false),
});

export const AppendFileActionSchema = z.object({
  type: z.literal("append_file"),
  path: z.string().min(1),
  content: z.string().optional(),
  content_lines: z.array(z.string()).optional(),
  encoding: z.string().default("utf-8"),
  create: z.boolean().default(false),
});

export const ReadFileActionSchema = z.object({
  type: z.literal("read_file"),
  path: z.string().min(1),
  encoding: z.string().default("utf-8"),
});

export const ListFilesActionSchema = z.object({
  type: z.literal("list_files"),
  path: z.string().default(""),
  max_depth: z.number().int().min(1).max(12).default(2),
});

export const GlobFilesActionSchema = z.object({
  type: z.literal("glob_files"),
  path: z.string().default(""),
  pattern: z.string().min(1),
  max_results: z.number().int().min(1).max(1000).default(200),
});

export const GrepFilesActionSchema = z.object({
  type: z.literal("grep_files"),
  path: z.string().default(""),
  pattern: z.string().min(1),
  include: z.string().optional(),
  max_results: z.number().int().min(1).max(1000).default(100),
});

export const ApplyPatchActionSchema = z.object({
  type: z.literal("apply_patch"),
  path: z.string().min(1),
  edits: z.array(
    z.object({
      search: z.string().min(1),
      replace: z.string(),
    }),
  ),
  encoding: z.string().default("utf-8"),
});

export const RunCommandActionSchema = z.object({
  type: z.literal("run_command"),
  command: z.string().min(1),
  cwd: z.string().default(""),
  timeout_ms: z.number().int().min(100).max(120_000).default(30_000),
});

export const SshRunActionSchema = z.object({
  type: z.literal("ssh_run"),
  profile: z.string().min(1),
  command: z.string().min(1),
  timeout_ms: z.number().int().min(100).max(120_000).default(30_000),
});

export const SshReadFileActionSchema = z.object({
  type: z.literal("ssh_read_file"),
  profile: z.string().min(1),
  path: z.string().min(1),
  encoding: z.string().default("utf-8"),
  timeout_ms: z.number().int().min(100).max(120_000).default(30_000),
});

export const SshWriteFileActionSchema = z.object({
  type: z.literal("ssh_write_file"),
  profile: z.string().min(1),
  path: z.string().min(1),
  content: z.string().optional(),
  content_lines: z.array(z.string()).optional(),
  encoding: z.string().default("utf-8"),
  overwrite: z.boolean().default(false),
  timeout_ms: z.number().int().min(100).max(120_000).default(30_000),
});

export const McpCallActionSchema = z.object({
  type: z.literal("mcp_call"),
  server: z.string().min(1),
  tool: z.string().min(1),
  arguments: z.record(z.unknown()).default({}),
  timeout_ms: z.number().int().min(100).max(120_000).default(10_000),
});

export const TdaiMemorySearchActionSchema = z.object({
  type: z.literal("tdai_memory_search"),
  query: z.string().min(1),
  limit: z.number().int().min(1).max(20).default(5),
  memory_type: z.enum(["persona", "episodic", "instruction"]).optional(),
  scene: z.string().optional(),
});

export const TdaiConversationSearchActionSchema = z.object({
  type: z.literal("tdai_conversation_search"),
  query: z.string().min(1),
  limit: z.number().int().min(1).max(20).default(5),
  session_key: z.string().optional(),
});

export const TodoWriteActionSchema = z.object({
  type: z.literal("TodoWrite"),
  scope: z.string().default("project"),
  todos: z.array(z.object({
    id: z.string().optional(),
    content: z.string().min(1),
    activeForm: z.string().min(1).optional(),
    status: z.enum(["pending", "in_progress", "completed"]),
  })),
});

export const EnterPlanModeActionSchema = z.object({
  type: z.literal("EnterPlanMode"),
  goal: z.string().optional(),
  run_id: z.string().optional(),
});

const AskUserQuestionOptionSchema = z.object({
  label: z.string().min(1),
  description: z.string().min(1),
  preview: z.string().optional(),
});

const AskUserQuestionItemSchema = z.object({
  question: z.string().min(1),
  header: z.string().min(1).max(24),
  options: z.array(AskUserQuestionOptionSchema).min(2).max(4),
  multiSelect: z.boolean().optional(),
});

export const AskUserQuestionActionSchema = z.object({
  type: z.literal("AskUserQuestion"),
  questions: z.array(AskUserQuestionItemSchema).min(1).max(4),
  run_id: z.string().optional(),
});

export const ExitPlanModeActionSchema = z.object({
  type: z.literal("ExitPlanMode"),
  plan: z.string().min(1),
  summary: z.string().optional(),
  run_id: z.string().optional(),
});

export const ValidateArtifactActionSchema = z.object({
  type: z.literal("validate_artifact"),
  path: z.string().min(1),
  expected_kind: ArtifactKindSchema.optional(),
});

export const BrowserSessionStartActionSchema = z.object({
  type: z.literal("browser_session_start"),
  url: z.string().min(1),
  visible: z.boolean().default(true),
});

export const BrowserSnapshotActionSchema = z.object({
  type: z.literal("browser_snapshot"),
  url: z.string().min(1),
});

export const BrowserScreenshotActionSchema = z.object({
  type: z.literal("browser_screenshot"),
  url: z.string().min(1),
  path: z.string().min(1),
  full_page: z.boolean().default(false),
});

export const BrowserClickActionSchema = z.object({
  type: z.literal("browser_click"),
  url: z.string().min(1),
  selector: z.string().min(1),
});

export const BrowserTypeActionSchema = z.object({
  type: z.literal("browser_type"),
  url: z.string().min(1),
  selector: z.string().min(1),
  text: z.string(),
});

export const PlannedDocxActionSchema = z.object({
  type: z.literal("create_docx"),
  path: z.string().min(1),
  markdown: z.string().optional(),
  markdown_lines: z.array(z.string()).optional(),
});

export const PptxSlideSchema = z.object({
  title: z.string().min(1),
  bullets: z.array(z.string().min(1)).default([]),
  speaker_notes: z.string().optional(),
  visual: z.string().optional(),
});

export const PlannedPptxActionSchema = z.object({
  type: z.literal("create_pptx"),
  path: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  include_title_slide: z.boolean().default(false),
  slides: z.array(PptxSlideSchema).min(1).max(20),
});

export const PlannedPdfActionSchema = z.object({
  type: z.literal("create_pdf"),
  path: z.string().min(1),
  markdown: z.string().optional(),
  markdown_lines: z.array(z.string()).optional(),
});

export const PlannedComputerUseActionSchema = z.object({
  type: z.literal("computer_use"),
  instruction: z.string().min(1),
});

export const InvokeSkillActionSchema = z.object({
  type: z.literal("invoke_skill"),
  name: z.string().min(1),
  task: z.string().min(1),
  max_turns: z.number().int().min(1).max(6).optional(),
});

export const InvokeAgentActionSchema = z.object({
  type: z.literal("invoke_agent"),
  name: z.string().min(1),
  task: z.string().min(1),
});

export const AgentRoleSpecSchema = z.object({
  name: z.string().min(1),
  responsibility: z.string().min(1),
  skills: z.array(z.string().min(1)).default([]),
  tools: z.array(z.string().min(1)).default([]),
  acceptance: z.array(z.string().min(1)).default([]),
});

export const StartAgentWorkflowActionSchema = z.object({
  type: z.literal("start_agent_workflow"),
  objective: z.string().min(1),
  roles: z.array(AgentRoleSpecSchema).default([]),
  acceptance_criteria: z.array(z.string().min(1)).default([]),
  max_steps: z.number().int().min(1).max(50).default(12),
});

export const SendAgentMessageActionSchema = z.object({
  type: z.literal("send_agent_message"),
  workflow_id: z.string().optional(),
  from: z.string().min(1).default("supervisor"),
  to: z.string().min(1),
  message: z.string().min(1),
});

export const AgentStatusActionSchema = z.object({
  type: z.literal("agent_status"),
  workflow_id: z.string().optional(),
});

export const FinishAgentWorkflowActionSchema = z.object({
  type: z.literal("finish_agent_workflow"),
  workflow_id: z.string().optional(),
  status: z.enum(["succeeded", "failed", "needs_followup"]).default("succeeded"),
  summary: z.string().min(1),
  artifacts: z.array(z.string().min(1)).default([]),
  issues: z.array(z.string().min(1)).default([]),
});

export const ActionRequestSchema = z.discriminatedUnion("type", [
  WriteFileActionSchema,
  AppendFileActionSchema,
  ReadFileActionSchema,
  ListFilesActionSchema,
  GlobFilesActionSchema,
  GrepFilesActionSchema,
  ApplyPatchActionSchema,
  RunCommandActionSchema,
  SshRunActionSchema,
  SshReadFileActionSchema,
  SshWriteFileActionSchema,
  McpCallActionSchema,
  TdaiMemorySearchActionSchema,
  TdaiConversationSearchActionSchema,
  TodoWriteActionSchema,
  EnterPlanModeActionSchema,
  AskUserQuestionActionSchema,
  ExitPlanModeActionSchema,
  ValidateArtifactActionSchema,
  BrowserSessionStartActionSchema,
  BrowserSnapshotActionSchema,
  BrowserScreenshotActionSchema,
  BrowserClickActionSchema,
  BrowserTypeActionSchema,
  PlannedDocxActionSchema,
  PlannedPptxActionSchema,
  PlannedPdfActionSchema,
  PlannedComputerUseActionSchema,
  InvokeSkillActionSchema,
  InvokeAgentActionSchema,
  StartAgentWorkflowActionSchema,
  SendAgentMessageActionSchema,
  AgentStatusActionSchema,
  FinishAgentWorkflowActionSchema,
]);

export type ActionRequest = z.infer<typeof ActionRequestSchema>;

export const ActionEnvelopeSchema = z
  .object({
    task_kind: z.string().optional(),
    needs_local_tools: z.boolean().default(false),
    acceptance_criteria: z.array(z.string()).default([]),
    final_message: z.string().default(""),
    continue_work: z.boolean().optional(),
    remaining_work: z.string().optional(),
    actions: z.array(ActionRequestSchema).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.needs_local_tools && value.actions.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "needs_local_tools=true requires at least one action",
        path: ["actions"],
      });
    }
    value.actions.forEach((action, index) => {
      if (
        (action.type === "write_file" || action.type === "append_file" || action.type === "ssh_write_file") &&
        typeof action.content !== "string" &&
        !Array.isArray(action.content_lines)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${action.type} requires content or content_lines`,
          path: ["actions", index, "content"],
        });
      }
      if (
        (action.type === "create_docx" || action.type === "create_pdf") &&
        typeof action.markdown !== "string" &&
        !Array.isArray(action.markdown_lines)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${action.type} requires markdown or markdown_lines`,
          path: ["actions", index, "markdown"],
        });
      }
    });
  });

export type ActionEnvelope = z.infer<typeof ActionEnvelopeSchema>;

export interface ActionResult {
  action_type: string;
  status: "succeeded" | "failed";
  path?: string;
  message?: string;
  context?: string;
  artifact_kind?: ArtifactKind;
}

export interface ActionExecutionReport {
  final_message: string;
  status: "succeeded" | "failed";
  results: ActionResult[];
}

export function actionType(action: ActionRequest): string {
  return action.type;
}

export function artifactKindFromPath(path: string): ArtifactKind {
  const lower = path.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".pptx")) return "pptx";
  if (lower.endsWith(".pdf")) return "pdf";
  if (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp")
  ) {
    return "image";
  }
  return "file";
}
