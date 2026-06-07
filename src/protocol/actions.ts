import { z } from "zod";

export const ArtifactKindSchema = z.enum([
  "file",
  "html",
  "markdown",
  "docx",
  "pptx",
  "xlsx",
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

export const TaskOutputKindSchema = z.enum([
  "code",
  "cli",
  "web",
  "docx",
  "pptx",
  "xlsx",
  "pdf",
  "markdown",
  "data",
  "image",
  "automation",
  "mcp",
  "plugin",
  "unknown",
]);

export type TaskOutputKind = z.infer<typeof TaskOutputKindSchema>;

export const ExpectedTaskOutputSchema = z.object({
  kind: TaskOutputKindSchema.default("unknown"),
  description: z.string().min(1),
  required: z.boolean().default(true),
});

export const TaskCompletionContractSchema = z.object({
  objective: z.string().min(1).optional(),
  expectedOutputs: z.array(ExpectedTaskOutputSchema).default([]),
  acceptanceCriteria: z.array(z.string().min(1)).default([]),
  userConstraints: z.array(z.string().min(1)).default([]),
  verificationHints: z.array(z.string().min(1)).default([]),
  goal: z.string().min(1).optional(),
  expected_artifacts: z.array(z.string().min(1)).default([]),
  acceptance_criteria: z.array(z.string().min(1)).default([]),
  verifiable_behaviors: z.array(z.string().min(1)).default([]),
  user_constraints: z.array(z.string().min(1)).default([]),
});

export const VerifyTaskActionSchema = z.object({
  type: z.literal("verify_task"),
  path: z.string().default(""),
  objective: z.string().optional(),
  contract: TaskCompletionContractSchema.optional(),
  mode: z.enum(["auto", "quick", "full"]).default("auto"),
  install_dependencies: z.boolean().default(true),
  run_build: z.boolean().default(true),
  run_tests: z.boolean().default(true),
  launch: z.boolean().default(true),
  capture_preview: z.boolean().default(true),
  timeout_ms: z.number().int().min(1000).max(180_000).default(45_000),
});

export const VerifyProjectActionSchema = z.object({
  type: z.literal("verify_project"),
  path: z.string().default(""),
  mode: z.enum(["auto", "quick", "full"]).default("auto"),
  install_dependencies: z.boolean().default(false),
  run_build: z.boolean().default(true),
  run_tests: z.boolean().default(false),
  capture_preview: z.boolean().default(true),
  timeout_ms: z.number().int().min(1000).max(120_000).default(30_000),
});

export const LaunchProjectActionSchema = z.object({
  type: z.literal("launch_project"),
  path: z.string().default(""),
  command: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  capture_preview: z.boolean().default(true),
  timeout_ms: z.number().int().min(1000).max(120_000).default(20_000),
});

export const ListProjectProcessesActionSchema = z.object({
  type: z.literal("list_project_processes"),
  include_stale: z.boolean().default(true),
});

export const StopProjectProcessActionSchema = z.object({
  type: z.literal("stop_project_process"),
  target: z.string().default("latest"),
  verify_port_released: z.boolean().default(true),
  timeout_ms: z.number().int().min(1000).max(30_000).default(8_000),
});

export const TerminalResetActionSchema = z.object({
  type: z.literal("terminal_reset"),
});

export const BrowserAgentActionSchema = z.object({
  type: z.literal("browser_agent"),
  task: z.string().min(1),
  url: z.string().optional(),
  adapter: z.enum(["playwright", "external"]).default("playwright"),
  timeout_ms: z.number().int().min(1000).max(120_000).default(30_000),
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
  title: z.string().optional(),
  author: z.string().optional(),
  page_size: z.enum(["A4", "LETTER"]).default("A4"),
  font_path: z.string().optional(),
  render_preview: z.boolean().default(false),
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

export const SearchSkillsActionSchema = z.object({
  type: z.literal("search_skills"),
  query: z.string().default(""),
  limit: z.number().int().min(1).max(50).default(10),
});

export const InvokeAgentActionSchema = z.object({
  type: z.literal("invoke_agent"),
  name: z.string().min(1),
  task: z.string().min(1),
});

export const AgentRoleSpecSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  responsibility: z.string().min(1),
  contextScope: z.string().min(1).optional(),
  allowedTools: z.array(z.string().min(1)).default([]),
  preloadedSkills: z.array(z.string().min(1)).default([]),
  assignedTasks: z.array(z.string().min(1)).default([]),
  skills: z.array(z.string().min(1)).default([]),
  tools: z.array(z.string().min(1)).default([]),
  acceptance: z.array(z.string().min(1)).default([]),
  acceptanceCriteria: z.array(z.string().min(1)).default([]),
  checkpoint: z.string().optional(),
}).superRefine((role, ctx) => {
  if (!role.name && !role.role) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "agent role requires name or role",
      path: ["name"],
    });
  }
});

export const StartAgentWorkflowActionSchema = z.object({
  type: z.literal("start_agent_workflow"),
  objective: z.string().min(1),
  roles: z.array(AgentRoleSpecSchema).default([]),
  contract: TaskCompletionContractSchema.optional(),
  acceptance_criteria: z.array(z.string().min(1)).default([]),
  max_steps: z.number().int().min(1).max(50).default(12),
  autoApprove: z.boolean().default(false),
});

export const RunAgentWorkflowStepActionSchema = z.object({
  type: z.literal("run_agent_workflow_step"),
  workflow_id: z.string().optional(),
  role: z.string().optional(),
  subtask_id: z.string().optional(),
  max_turns: z.number().int().min(1).max(6).default(2),
});

export const DrainAgentWorkflowActionSchema = z.object({
  type: z.literal("drain_agent_workflow"),
  workflow_id: z.string().optional(),
  max_steps: z.number().int().min(1).max(50).default(12),
  max_turns_per_role: z.number().int().min(1).max(6).default(2),
});

export const ApproveAgentWorkflowPlanActionSchema = z.object({
  type: z.literal("approve_agent_workflow_plan"),
  workflow_id: z.string().optional(),
  note: z.string().optional(),
});

export const ReviseAgentWorkflowPlanActionSchema = z.object({
  type: z.literal("revise_agent_workflow_plan"),
  workflow_id: z.string().optional(),
  instructions: z.string().min(1),
});

export const RegenerateAgentWorkflowPlanActionSchema = z.object({
  type: z.literal("regenerate_agent_workflow_plan"),
  workflow_id: z.string().optional(),
  instructions: z.string().optional(),
});

export const CancelAgentWorkflowPlanActionSchema = z.object({
  type: z.literal("cancel_agent_workflow_plan"),
  workflow_id: z.string().optional(),
  reason: z.string().optional(),
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
  VerifyTaskActionSchema,
  VerifyProjectActionSchema,
  LaunchProjectActionSchema,
  ListProjectProcessesActionSchema,
  StopProjectProcessActionSchema,
  TerminalResetActionSchema,
  BrowserAgentActionSchema,
  BrowserSessionStartActionSchema,
  BrowserSnapshotActionSchema,
  BrowserScreenshotActionSchema,
  BrowserClickActionSchema,
  BrowserTypeActionSchema,
  PlannedDocxActionSchema,
  PlannedPptxActionSchema,
  PlannedPdfActionSchema,
  PlannedComputerUseActionSchema,
  SearchSkillsActionSchema,
  InvokeSkillActionSchema,
  InvokeAgentActionSchema,
  StartAgentWorkflowActionSchema,
  ApproveAgentWorkflowPlanActionSchema,
  ReviseAgentWorkflowPlanActionSchema,
  RegenerateAgentWorkflowPlanActionSchema,
  CancelAgentWorkflowPlanActionSchema,
  RunAgentWorkflowStepActionSchema,
  DrainAgentWorkflowActionSchema,
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
  if (lower.endsWith(".xlsx")) return "xlsx";
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
