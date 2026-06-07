import fs from "node:fs";
import path from "node:path";
import { buildTool, type ToolExecutionContext, type Tools } from "../Tool.js";
import {
  captureBrowserScreenshot,
  captureBrowserSnapshot,
  clickBrowserSelector,
  typeBrowserSelector,
} from "../bridge/cdpClient.js";
import {
  actionType,
  ActionRequestSchema,
  AgentStatusActionSchema,
  ApproveAgentWorkflowPlanActionSchema,
  ApplyPatchActionSchema,
  AskUserQuestionActionSchema,
  BrowserClickActionSchema,
  BrowserAgentActionSchema,
  artifactKindFromPath,
  BrowserScreenshotActionSchema,
  BrowserSessionStartActionSchema,
  BrowserSnapshotActionSchema,
  BrowserTypeActionSchema,
  EnterPlanModeActionSchema,
  ExitPlanModeActionSchema,
  FinishAgentWorkflowActionSchema,
  DrainAgentWorkflowActionSchema,
  GlobFilesActionSchema,
  GrepFilesActionSchema,
  AppendFileActionSchema,
  InvokeAgentActionSchema,
  InvokeSkillActionSchema,
  LaunchProjectActionSchema,
  ListFilesActionSchema,
  McpCallActionSchema,
  PlannedComputerUseActionSchema,
  PlannedDocxActionSchema,
  PlannedPdfActionSchema,
  PlannedPptxActionSchema,
  ReadFileActionSchema,
  RegenerateAgentWorkflowPlanActionSchema,
  ReviseAgentWorkflowPlanActionSchema,
  RunCommandActionSchema,
  RunAgentWorkflowStepActionSchema,
  SearchSkillsActionSchema,
  SshReadFileActionSchema,
  SshRunActionSchema,
  SshWriteFileActionSchema,
  SendAgentMessageActionSchema,
  StartAgentWorkflowActionSchema,
  CancelAgentWorkflowPlanActionSchema,
  TdaiConversationSearchActionSchema,
  TdaiMemorySearchActionSchema,
  TodoWriteActionSchema,
  ValidateArtifactActionSchema,
  VerifyTaskActionSchema,
  VerifyProjectActionSchema,
  WriteFileActionSchema,
  type ActionEnvelope,
  type ActionExecutionReport,
  type ActionRequest,
  type ActionResult,
} from "../protocol/actions.js";
import { loadAgent } from "../agents/loader.js";
import {
  AgentWorkflowService,
  normalizeTaskCompletionContract,
  type AgentRoleState,
  type AgentWorkflowRecord,
  type GeneratedRoleSkill,
  type WorkflowRolePlan,
  type WorkflowSubtaskState,
} from "../services/agents/agentWorkflow.js";
import { hasApprovedToolAction, requireApprovalForToolAction } from "../services/approval/approvalPolicy.js";
import { McpService } from "../services/mcp/mcpService.js";
import { BrowserTrajectoryRecorder } from "../services/browser/browserTrajectory.js";
import { PlanModeService } from "../services/plans/planModeService.js";
import { QuestionService, formatQuestionRecord } from "../services/questions/questionService.js";
import { readRemoteTextFile, writeRemoteTextFile } from "../services/remote/sshFileSync.js";
import { SshProfileService } from "../services/remote/sshProfileService.js";
import { runSshCommand, summarizeSshCommand } from "../services/remote/sshRemoteExecutor.js";
import { TodoService, formatTodoList } from "../services/todos/todoService.js";
import { executeToolPlan } from "../services/tools/toolOrchestration.js";
import { discoverSkills } from "../skills/discovery.js";
import { loadSkill } from "../skills/loader.js";
import { buildContextBundle, contextBundlePrompt } from "../context/contextBundle.js";
import { buildActionSystemPrompt } from "../query/systemPrompt.js";
import { summarizeValidation, validateArtifact } from "./artifact.js";
import { startBrowserSession } from "./browser.js";
import { appendFile, applyTextPatch, globFiles, grepFiles, listFiles, readFileForTool, writeFile } from "./fs.js";
import { createDocxArtifact, createPptxArtifact } from "./officeArtifacts.js";
import {
  classifyCommandFailure,
  detectLongRunningCommand,
  formatFailureDiagnosis,
  formatPreflightFailure,
  preflightCommand,
} from "./commandPreflight.js";
import { safeJoin } from "./pathSafety.js";
import { formatProjectVerificationReport, launchProject, verifyProject, verifyTask } from "./projectVerification.js";
import { defaultShellPolicy, runCommand, summarizeCommand, type CommandOutput } from "./shell.js";

export const baseTools: Tools = [
  buildTool({
    name: "read_file",
    displayName: "Read",
    description: "Read a text file inside the selected project root. Binary artifacts and very large files return concise summaries.",
    inputSchema: ReadFileActionSchema,
    readOnly: true,
    concurrencySafe: true,
    run(input, context) {
      const output = readFileForTool(context.root, input.path);
      if (output.fullTextAvailable) {
        context.fileStateCache?.rememberRead(context.root, input.path);
      }
      return {
        data: output,
        result: {
          action_type: input.type,
          status: "succeeded",
          path: input.path,
          message: output.message,
          context: output.content,
        },
      };
    },
  }),
  buildTool({
    name: "list_files",
    displayName: "List",
    description: "List project files with a bounded recursive depth.",
    inputSchema: ListFilesActionSchema,
    readOnly: true,
    concurrencySafe: true,
    run(input, context) {
      const relativePath = input.path ?? "";
      const maxDepth = input.max_depth ?? 2;
      const entries = listFiles(context.root, relativePath, maxDepth);
      return {
        data: { entries },
        result: {
          action_type: input.type,
          status: "succeeded",
          path: relativePath,
          message: `${entries.length} entries`,
          context: entries.map((entry) => `${entry.kind}\t${entry.path}`).join("\n"),
        },
      };
    },
  }),
  buildTool({
    name: "write_file",
    displayName: "Write",
    description: "Write a UTF-8 file inside the selected project root.",
    inputSchema: WriteFileActionSchema,
    concurrencySafe: false,
    destructive: (input) => Boolean(input.overwrite),
    run(input, context) {
      if (input.overwrite) {
        const freshness = context.fileStateCache?.checkFreshForWrite(context.root, input.path);
        if (freshness && !freshness.fresh) {
          throw new Error(`refusing stale write: ${freshness.reason}`);
        }
      }
      const content = actionContent(input);
      const target = writeFile(context.root, input.path, content, Boolean(input.overwrite));
      context.fileStateCache?.rememberRead(context.root, input.path);
      return {
        result: {
          action_type: input.type,
          status: "succeeded",
          path: target,
          message: `${content.length} chars`,
          artifact_kind: artifactKindFromPath(input.path),
        },
      };
    },
  }),
  buildTool({
    name: "append_file",
    displayName: "Append",
    description: "Append a compact UTF-8 text chunk to a project file. Use this after write_file for large HTML, CSS, JS, Markdown, or other generated artifacts.",
    inputSchema: AppendFileActionSchema,
    concurrencySafe: false,
    destructive: true,
    run(input, context) {
      const content = actionContent(input);
      const target = appendFile(context.root, input.path, content, Boolean(input.create));
      context.fileStateCache?.rememberRead(context.root, input.path);
      return {
        result: {
          action_type: input.type,
          status: "succeeded",
          path: target,
          message: `${content.length} chars appended`,
          artifact_kind: artifactKindFromPath(input.path),
        },
      };
    },
  }),
  buildTool({
    name: "glob_files",
    displayName: "Glob",
    description: "Find project files by a wildcard pattern such as **/*.ts.",
    inputSchema: GlobFilesActionSchema,
    readOnly: true,
    concurrencySafe: true,
    run(input, context) {
      const matches = globFiles(context.root, input.path ?? "", input.pattern, input.max_results ?? 200);
      return {
        data: { matches },
        result: {
          action_type: input.type,
          status: "succeeded",
          path: input.path ?? "",
          message: matches.join("\n") || "no matches",
          context: matches.join("\n") || "no matches",
        },
      };
    },
  }),
  buildTool({
    name: "grep_files",
    displayName: "Grep",
    description: "Search text in project files with an optional include wildcard.",
    inputSchema: GrepFilesActionSchema,
    readOnly: true,
    concurrencySafe: true,
    run(input, context) {
      const matches = grepFiles(
        context.root,
        input.path ?? "",
        input.pattern,
        input.include,
        input.max_results ?? 100,
      );
      return {
        data: { matches },
        result: {
          action_type: input.type,
          status: "succeeded",
          path: input.path ?? "",
          message: matches.map((match) => `${match.path}:${match.line}: ${match.text}`).join("\n") || "no matches",
          context: matches.map((match) => `${match.path}:${match.line}: ${match.text}`).join("\n") || "no matches",
        },
      };
    },
  }),
  buildTool({
    name: "apply_patch",
    displayName: "Patch",
    description: "Apply exact search/replace edits to a project file.",
    inputSchema: ApplyPatchActionSchema,
    concurrencySafe: false,
    destructive: true,
    run(input, context) {
      const freshness = context.fileStateCache?.checkFresh(context.root, input.path);
      if (freshness && !freshness.fresh) {
        throw new Error(`refusing stale patch: ${freshness.reason}`);
      }
      const target = applyTextPatch(context.root, input.path, input.edits);
      context.fileStateCache?.rememberRead(context.root, input.path);
      return {
        result: {
          action_type: input.type,
          status: "succeeded",
          path: target,
          message: `${input.edits.length} edits`,
          artifact_kind: artifactKindFromPath(input.path),
        },
      };
    },
  }),
  buildTool({
    name: "run_command",
    displayName: "Shell",
    description: "Run a shell command in the project after explicit shell permission. On Windows this uses PowerShell, not cmd.exe; bash-only commands are rejected with repair guidance.",
    inputSchema: RunCommandActionSchema,
    concurrencySafe: false,
    destructive: true,
    permissions(_input, context) {
      if (!context.allowShell && !hasApprovedParsedToolAction(context, _input)) {
        return {
          behavior: "deny",
          message: "Shell execution is disabled. Start with --allow-shell or run /shell on.",
        };
      }
      return { behavior: "allow" };
    },
    async run(input, context) {
      const preflight = preflightCommand(input.command);
      if (!preflight.ok) {
        const message = formatPreflightFailure(input.command, preflight);
        return {
          data: { preflight },
          result: {
            action_type: input.type,
            status: "failed",
            path: input.cwd ?? "",
            message,
            context: message,
          },
        };
      }
      const longRunning = detectLongRunningCommand(input.command);
      if (longRunning.detected) {
        const message = [
          "Command was not executed because it looks like a long-running local service.",
          "category=long_running_process",
          `command=${input.command}`,
          `reason=${longRunning.reason ?? "The command is expected to keep running instead of exiting."}`,
          `suggestion=${longRunning.suggestion ?? "Use launch_project or verify_task instead of run_command."}`,
        ].join("\n");
        return {
          data: { longRunning },
          result: {
            action_type: input.type,
            status: "failed",
            path: input.cwd ?? "",
            message,
            context: message,
          },
        };
      }
      const output = await runCommand(context.root, input.command, input.cwd ?? "", input.timeout_ms ?? 30_000, {
        ...defaultShellPolicy,
        allowShell: context.allowShell || hasApprovedParsedToolAction(context, input),
      }, {
        signal: context.abortSignal,
      });
      const diagnosis = classifyCommandFailure(output);
      const detail = formatFailureDiagnosis(diagnosis);
      return {
        data: { ...output, diagnosis },
        result: {
          action_type: input.type,
          status: output.exitCode === 0 && !output.timedOut ? "succeeded" : "failed",
          path: output.cwd,
          message: [summarizeCommand(output), detail].filter(Boolean).join("\n"),
          context: [commandContext(output), detail].filter(Boolean).join("\n"),
        },
      };
    },
  }),
  buildTool({
    name: "verify_task",
    displayName: "Verify Task",
    description: "Verify a task against a model-authored completion contract using real project files, scripts, documents, data, media, package manifests, and launch/build/test checks. This is the generic completion gate; HTML is only one artifact type.",
    inputSchema: VerifyTaskActionSchema,
    readOnly: true,
    concurrencySafe: false,
    destructive: false,
    async run(input, context) {
      const report = await verifyTask(context.root, input, context);
      return {
        data: report,
        result: {
          action_type: input.type,
          status: report.status,
          path: report.previewPath ?? report.root,
          artifact_kind: report.previewPath ? "screenshot" : undefined,
          message: formatProjectVerificationReport(report),
        },
      };
    },
  }),
  buildTool({
    name: "verify_project",
    displayName: "Verify Project",
    description: "Inspect generated project artifacts, run available build/test checks when allowed, and capture previews for HTML/Office/PDF outputs.",
    inputSchema: VerifyProjectActionSchema,
    readOnly: true,
    concurrencySafe: false,
    destructive: false,
    async run(input, context) {
      const report = await verifyProject(context.root, input, context);
      return {
        data: report,
        result: {
          action_type: input.type,
          status: report.status,
          path: report.previewPath ?? report.root,
          message: formatProjectVerificationReport(report),
          context: formatProjectVerificationReport(report),
          artifact_kind: report.previewPath ? "screenshot" : undefined,
        },
      };
    },
  }),
  buildTool({
    name: "launch_project",
    displayName: "Launch Project",
    description: "Launch or preview a generated project and return a smoke-test report. Prefer this near the end of app/site/code tasks.",
    inputSchema: LaunchProjectActionSchema,
    readOnly: false,
    concurrencySafe: false,
    destructive: false,
    async run(input, context) {
      const report = await launchProject(context.root, input, context);
      return {
        data: report,
        result: {
          action_type: input.type,
          status: report.status,
          path: report.previewPath ?? report.root,
          message: formatProjectVerificationReport(report),
          context: formatProjectVerificationReport(report),
          artifact_kind: report.previewPath ? "screenshot" : undefined,
        },
      };
    },
  }),
  buildTool({
    name: "ssh_run",
    displayName: "SSH",
    description: "Run a command on a configured SSH profile after explicit shell permission.",
    inputSchema: SshRunActionSchema,
    concurrencySafe: false,
    destructive: true,
    permissions(_input, context) {
      if (!context.allowShell && !hasApprovedParsedToolAction(context, _input)) {
        return {
          behavior: "deny",
          message: "SSH execution is disabled. Start with --allow-shell, /shell on, or /permissions profile dev.",
        };
      }
      return { behavior: "allow" };
    },
    async run(input, context) {
      const service = new SshProfileService(context.root);
      const profile = service.getProfile(input.profile);
      if (!profile) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            path: input.profile,
            message: `SSH profile not found: ${input.profile}`,
          },
        };
      }
      const output = await runSshCommand(profile, input.command, {
        allowShell: context.allowShell || hasApprovedParsedToolAction(context, input),
        timeoutMs: input.timeout_ms,
        maxOutputChars: defaultShellPolicy.maxOutputChars,
        signal: context.abortSignal,
      });
      service.recordCommand(profile.name, output);
      return {
        data: output,
        result: {
          action_type: input.type,
          status: output.exitCode === 0 && !output.timedOut ? "succeeded" : "failed",
          path: profile.name,
          message: summarizeSshCommand(output),
        },
      };
    },
  }),
  buildTool({
    name: "ssh_read_file",
    displayName: "SSH Read",
    description: "Read a UTF-8 text file from a configured SSH profile after explicit shell permission.",
    inputSchema: SshReadFileActionSchema,
    readOnly: true,
    concurrencySafe: false,
    permissions(_input, context) {
      if (!context.allowShell && !hasApprovedParsedToolAction(context, _input)) {
        return {
          behavior: "deny",
          message: "SSH file access is disabled. Start with --allow-shell, /shell on, or /permissions profile dev.",
        };
      }
      return { behavior: "allow" };
    },
    async run(input, context) {
      const service = new SshProfileService(context.root);
      const profile = service.getProfile(input.profile);
      if (!profile) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            path: input.profile,
            message: `SSH profile not found: ${input.profile}`,
          },
        };
      }
      const result = await readRemoteTextFile(profile, input.path, {
        allowShell: context.allowShell || hasApprovedParsedToolAction(context, input),
        timeoutMs: input.timeout_ms,
        maxOutputChars: defaultShellPolicy.maxOutputChars,
        signal: context.abortSignal,
      });
      service.recordCommand(profile.name, result.output);
      return {
        data: { content: result.content, bytes: result.bytes, target: result.target },
        result: {
          action_type: input.type,
          status: "succeeded",
          path: `${profile.name}:${result.remotePath}`,
          message: `${result.bytes} bytes from ${result.target}`,
        },
      };
    },
  }),
  buildTool({
    name: "ssh_write_file",
    displayName: "SSH Write",
    description: "Write a UTF-8 text file to a configured SSH profile after explicit shell permission.",
    inputSchema: SshWriteFileActionSchema,
    concurrencySafe: false,
    destructive: true,
    permissions(_input, context) {
      if (!context.allowShell && !hasApprovedParsedToolAction(context, _input)) {
        return {
          behavior: "deny",
          message: "SSH file access is disabled. Start with --allow-shell, /shell on, or /permissions profile dev.",
        };
      }
      return { behavior: "allow" };
    },
    async run(input, context) {
      const service = new SshProfileService(context.root);
      const profile = service.getProfile(input.profile);
      if (!profile) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            path: input.profile,
            message: `SSH profile not found: ${input.profile}`,
          },
        };
      }
      const result = await writeRemoteTextFile(profile, input.path, actionContent(input), {
        allowShell: context.allowShell || hasApprovedParsedToolAction(context, input),
        timeoutMs: input.timeout_ms,
        maxOutputChars: defaultShellPolicy.maxOutputChars,
        overwrite: input.overwrite,
        signal: context.abortSignal,
      });
      service.recordCommand(profile.name, result.output);
      return {
        data: { bytes: result.bytes, target: result.target },
        result: {
          action_type: input.type,
          status: "succeeded",
          path: `${profile.name}:${result.remotePath}`,
          message: `${result.bytes} bytes to ${result.target}`,
        },
      };
    },
  }),
  buildTool({
    name: "mcp_call",
    displayName: "MCP",
    description: "Call a configured stdio MCP server tool after explicit shell permission.",
    inputSchema: McpCallActionSchema,
    concurrencySafe: false,
    destructive: false,
    permissions(input, context) {
      const service = new McpService(context.root);
      let requiresShell = true;
      try {
        requiresShell = service.requiresShell(input.server);
      } catch {
        requiresShell = false;
      }
      if (requiresShell && !context.allowShell && !hasApprovedParsedToolAction(context, input)) {
        return {
          behavior: "deny",
          message: "MCP stdio calls require shell execution. Start with --allow-shell or run /shell on.",
        };
      }
      return { behavior: "allow" };
    },
    async run(input, context) {
      const service = new McpService(context.root);
      const output = await service.callTool(input.server, input.tool, input.arguments ?? {}, {
        allowShell: context.allowShell || hasApprovedParsedToolAction(context, input),
        timeoutMs: input.timeout_ms,
        signal: context.abortSignal,
      });
      return {
        data: output,
        result: {
          action_type: input.type,
          status: "succeeded",
          path: input.server,
          message: JSON.stringify(output.result, null, 2),
        },
      };
    },
  }),
  buildTool({
    name: "tdai_memory_search",
    displayName: "Memory Search",
    description: "Search TencentDB-Agent-Memory L1 structured long-term memories for user preferences, past facts, project decisions, and durable instructions.",
    inputSchema: TdaiMemorySearchActionSchema,
    readOnly: true,
    concurrencySafe: true,
    async run(input, context) {
      if (!context.memoryService) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            message: "TencentDB-Agent-Memory is not attached to this run.",
          },
        };
      }
      const result = await context.memoryService.searchMemory({
        query: input.query,
        limit: input.limit,
        memoryType: input.memory_type,
        scene: input.scene,
      });
      return {
        data: result.details,
        result: {
          action_type: input.type,
          status: "succeeded",
          message: result.text,
        },
      };
    },
  }),
  buildTool({
    name: "tdai_conversation_search",
    displayName: "Conversation Search",
    description: "Search TencentDB-Agent-Memory L0 raw conversation history when exact older wording or dialogue context is needed.",
    inputSchema: TdaiConversationSearchActionSchema,
    readOnly: true,
    concurrencySafe: true,
    async run(input, context) {
      if (!context.memoryService) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            message: "TencentDB-Agent-Memory is not attached to this run.",
          },
        };
      }
      const result = await context.memoryService.searchConversations({
        query: input.query,
        limit: input.limit,
        sessionKey: input.session_key,
      });
      return {
        data: result.details,
        result: {
          action_type: input.type,
          status: "succeeded",
          message: result.text,
        },
      };
    },
  }),
  buildTool({
    name: "TodoWrite",
    displayName: "TodoWrite",
    description: "Update the structured todo list for the current DeepSeekCode project/session.",
    inputSchema: TodoWriteActionSchema,
    concurrencySafe: false,
    destructive: false,
    run(input, context) {
      const result = new TodoService(context.root).writeTodos(input.todos, input.scope);
      return {
        data: {
          oldTodos: result.oldTodos,
          newTodos: result.newTodos,
          storedTodos: result.storedTodos,
          cleared: result.cleared,
        },
        result: {
          action_type: input.type,
          status: "succeeded",
          path: result.scope,
          message: result.cleared
            ? "All todos completed; todo list cleared."
            : [
                `todos ${result.scope}: total=${result.summary.total} pending=${result.summary.pending} in_progress=${result.summary.inProgress} completed=${result.summary.completed}`,
                formatTodoList(result.storedTodos),
              ].join("\n"),
        },
      };
    },
  }),
  buildTool({
    name: "EnterPlanMode",
    displayName: "Plan",
    description: "Create a DeepSeekCode implementation plan draft for the current run before editing code.",
    inputSchema: EnterPlanModeActionSchema,
    concurrencySafe: false,
    destructive: false,
    run(input, context) {
      if (!context.state || !(input.run_id || context.runId)) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            message: "EnterPlanMode requires a run context.",
          },
        };
      }
      const runId = input.run_id ?? context.runId!;
      const record = new PlanModeService(context.root, context.state).enter(runId, input.goal ?? "");
      return {
        data: record,
        result: {
          action_type: input.type,
          status: "succeeded",
          path: record.relativePath,
          message: [
            "Entered plan mode. Explore the codebase and write the implementation plan before editing code.",
            `plan=${record.relativePath}`,
          ].join("\n"),
        },
      };
    },
  }),
  buildTool({
    name: "AskUserQuestion",
    displayName: "Question",
    description: "Ask the user bounded multiple-choice clarification questions and pause the current run.",
    inputSchema: AskUserQuestionActionSchema,
    concurrencySafe: false,
    destructive: false,
    run(input, context) {
      if (!context.state || !(input.run_id || context.runId)) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            message: "AskUserQuestion requires a run context.",
          },
        };
      }
      const runId = input.run_id ?? context.runId!;
      const record = new QuestionService(context.root, context.state).request(runId, input.questions);
      return {
        data: record,
        result: {
          action_type: input.type,
          status: "failed",
          message: [
            "Question awaiting user answer.",
            formatQuestionRecord(record, { includeIds: false }),
            "Waiting for your answer in the permission panel.",
          ].join("\n"),
        },
      };
    },
  }),
  buildTool({
    name: "ExitPlanMode",
    displayName: "Plan Approval",
    description: "Save an implementation plan and request user approval before continuing.",
    inputSchema: ExitPlanModeActionSchema,
    concurrencySafe: false,
    destructive: false,
    run(input, context) {
      if (!context.state || !(input.run_id || context.runId)) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            message: "ExitPlanMode requires a run context.",
          },
        };
      }
      const runId = input.run_id ?? context.runId!;
      const record = new PlanModeService(context.root, context.state).exit(runId, input.plan, input.summary ?? "");
      return {
        data: record,
        result: {
          action_type: input.type,
          status: "failed",
          path: record.relativePath,
          message: `Approval required: plan ${record.relativePath}. Waiting for your approval in the permission panel.`,
        },
      };
    },
  }),
  buildTool({
    name: "validate_artifact",
    displayName: "Validate",
    description: "Validate a generated file artifact and report user-visible issues.",
    inputSchema: ValidateArtifactActionSchema,
    readOnly: true,
    concurrencySafe: true,
    run(input, context) {
      const report = validateArtifact(context.root, input.path, input.expected_kind);
      return {
        data: report,
        result: {
          action_type: input.type,
          status: report.errors.length === 0 ? "succeeded" : "failed",
          path: report.path,
          message: summarizeValidation(report),
          artifact_kind: report.kind,
        },
      };
    },
  }),
  buildTool({
    name: "browser_session_start",
    displayName: "Browser",
    description: "Start a browser session for a declared URL after explicit browser permission.",
    inputSchema: BrowserSessionStartActionSchema,
    concurrencySafe: false,
    destructive: false,
    permissions(_input, context) {
      if (!context.allowBrowser) {
        return {
          behavior: "deny",
          message: "Browser control is disabled. Start with --allow-browser or run /browser on.",
        };
      }
      return { behavior: "allow" };
    },
    run(input, context) {
      try {
        const message = startBrowserSession(input.url, input.visible ?? true, {
          allowBrowser: context.allowBrowser,
          dataDir: context.dataDir,
        });
        recordBrowserTool(context.dataDir, {
          action: "open",
          url: input.url,
          status: "succeeded",
          message,
        });
        return {
          result: {
            action_type: input.type,
            status: "succeeded",
            path: input.url,
            message,
          },
        };
      } catch (error) {
        recordBrowserTool(context.dataDir, {
          action: "open",
          url: input.url,
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
  buildTool({
    name: "browser_snapshot",
    displayName: "Snapshot",
    description: "Capture a text snapshot of a URL through a configured Chrome CDP session.",
    inputSchema: BrowserSnapshotActionSchema,
    readOnly: true,
    concurrencySafe: false,
    permissions(_input, context) {
      if (!context.allowBrowser) {
        return {
          behavior: "deny",
          message: "Browser control is disabled. Start with --allow-browser or run /browser on.",
        };
      }
      return { behavior: "allow" };
    },
    async run(input, context) {
      try {
        const snapshot = await captureBrowserSnapshot(input.url);
        recordBrowserTool(context.dataDir, {
          action: "snapshot",
          url: input.url,
          finalUrl: snapshot.url,
          status: "succeeded",
          title: snapshot.title,
          textChars: snapshot.text.length,
          message: `title: ${snapshot.title}`,
        });
        return {
          data: snapshot,
          result: {
            action_type: input.type,
            status: "succeeded",
            path: snapshot.url,
            message: [`title: ${snapshot.title}`, snapshot.text.slice(0, 4000)].join("\n"),
          },
        };
      } catch (error) {
        recordBrowserTool(context.dataDir, {
          action: "snapshot",
          url: input.url,
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
  buildTool({
    name: "browser_screenshot",
    displayName: "Screenshot",
    description: "Capture a PNG screenshot of a URL through a configured Chrome CDP session.",
    inputSchema: BrowserScreenshotActionSchema,
    concurrencySafe: false,
    permissions(_input, context) {
      if (!context.allowBrowser) {
        return {
          behavior: "deny",
          message: "Browser control is disabled. Start with --allow-browser or run /browser on.",
        };
      }
      return { behavior: "allow" };
    },
    async run(input, context) {
      const target = safeJoin(context.root, input.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      try {
        const bytes = await captureBrowserScreenshot(input.url, input.full_page ?? false);
        fs.writeFileSync(target, bytes);
        recordBrowserTool(context.dataDir, {
          action: "screenshot",
          url: input.url,
          path: input.path,
          status: "succeeded",
          bytes: bytes.length,
          message: `${bytes.length} bytes`,
        });
        return {
          result: {
            action_type: input.type,
            status: "succeeded",
            path: input.path,
            message: `${bytes.length} bytes`,
            artifact_kind: "screenshot",
          },
        };
      } catch (error) {
        recordBrowserTool(context.dataDir, {
          action: "screenshot",
          url: input.url,
          path: input.path,
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
  buildTool({
    name: "browser_click",
    displayName: "Click",
    description: "Click a CSS selector in a URL through a configured Chrome CDP session.",
    inputSchema: BrowserClickActionSchema,
    concurrencySafe: false,
    permissions(_input, context) {
      if (!context.allowBrowser) {
        return {
          behavior: "deny",
          message: "Browser control is disabled. Start with --allow-browser or run /browser on.",
        };
      }
      return { behavior: "allow" };
    },
    async run(input, context) {
      try {
        const status = await clickBrowserSelector(input.url, input.selector);
        recordBrowserTool(context.dataDir, {
          action: "click",
          url: input.url,
          selector: input.selector,
          status: status === "clicked" ? "succeeded" : "failed",
          message: status,
        });
        return {
          result: {
            action_type: input.type,
            status: status === "clicked" ? "succeeded" : "failed",
            path: input.url,
            message: `${status}: ${input.selector}`,
          },
        };
      } catch (error) {
        recordBrowserTool(context.dataDir, {
          action: "click",
          url: input.url,
          selector: input.selector,
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
  buildTool({
    name: "browser_type",
    displayName: "Type",
    description: "Type into a CSS selector in a URL through a configured Chrome CDP session.",
    inputSchema: BrowserTypeActionSchema,
    concurrencySafe: false,
    permissions(_input, context) {
      if (!context.allowBrowser) {
        return {
          behavior: "deny",
          message: "Browser control is disabled. Start with --allow-browser or run /browser on.",
        };
      }
      return { behavior: "allow" };
    },
    async run(input, context) {
      try {
        const status = await typeBrowserSelector(input.url, input.selector, input.text);
        recordBrowserTool(context.dataDir, {
          action: "type",
          url: input.url,
          selector: input.selector,
          status: status === "typed" ? "succeeded" : "failed",
          message: `${status}; textChars=${input.text.length}`,
        });
        return {
          result: {
            action_type: input.type,
            status: status === "typed" ? "succeeded" : "failed",
            path: input.url,
            message: `${status}: ${input.selector}`,
          },
        };
      } catch (error) {
        recordBrowserTool(context.dataDir, {
          action: "type",
          url: input.url,
          selector: input.selector,
          status: "failed",
          message: `${error instanceof Error ? error.message : String(error)}; textChars=${input.text.length}`,
        });
        throw error;
      }
    },
  }),
  buildTool({
    name: "browser_agent",
    displayName: "Browser Agent",
    description: "Run a lightweight browser verification task with the built-in CDP/Playwright-compatible adapter. External browser agents are optional and not bundled.",
    inputSchema: BrowserAgentActionSchema,
    readOnly: true,
    concurrencySafe: false,
    permissions(input, context) {
      if (input.url && !context.allowBrowser) {
        return {
          behavior: "deny",
          message: "Browser agent requires browser permission when a URL is provided. Start with --allow-browser or run /browser on.",
        };
      }
      return { behavior: "allow" };
    },
    async run(input, context) {
      if (input.adapter === "external") {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            message: "External browser_agent adapters are not bundled. Install and configure an adapter, or use the built-in Playwright/CDP browser tools.",
          },
        };
      }
      if (!input.url) {
        return {
          result: {
            action_type: input.type,
            status: "succeeded",
            message: "No URL was provided. Use browser_agent with a URL after launch_project or browser_session_start.",
          },
        };
      }
      const snapshot = await captureBrowserSnapshot(input.url);
      return {
        data: snapshot,
        result: {
          action_type: input.type,
          status: snapshot.text.trim().length ? "succeeded" : "failed",
          path: snapshot.url,
          message: [
            `task=${input.task}`,
            `title=${snapshot.title}`,
            snapshot.text.trim().length ? "page_text_detected=true" : "page_text_detected=false; possible blank page",
            snapshot.text.slice(0, 1600),
          ].join("\n"),
        },
      };
    },
  }),
  buildTool({
    name: "invoke_agent",
    displayName: "Agent",
    description: "Load a named DeepSeekCode agent prompt for delegated work.",
    inputSchema: InvokeAgentActionSchema,
    readOnly: true,
    concurrencySafe: true,
    run(input, context) {
      const agent = loadAgent(context.root, context.dataDir ?? context.root, input.name);
      if (!agent) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            message: `agent not found: ${input.name}`,
          },
        };
      }
      const excerpt = agent.prompt.slice(0, 4000);
      return {
        data: { agent, task: input.task, prompt: excerpt },
        result: {
          action_type: input.type,
          status: "succeeded",
          path: agent.path,
          message: [
            `agent ${agent.scope}/${agent.name} loaded for task: ${input.task}`,
            `model: ${agent.model}`,
            agent.tools?.length ? `tools: ${agent.tools.join(", ")}` : "tools: inherited",
            excerpt,
          ].join("\n"),
        },
      };
    },
  }),
  buildTool({
    name: "start_agent_workflow",
    displayName: "Agent Workflow",
    description: "Start a project-scoped multi-agent workflow with role specs, shared blackboard messages, and a default reviewer role.",
    inputSchema: StartAgentWorkflowActionSchema,
    concurrencySafe: false,
    destructive: false,
    async run(input, context) {
      if (!context.state || !context.runId) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            message: "start_agent_workflow requires a run context.",
          },
        };
      }
      const planned = await buildWorkflowPlanForStart(input, context);
      const workflow = new AgentWorkflowService(context.state, context.root).start({
        runId: context.runId,
        objective: input.objective,
        roles: (input.roles ?? []).map((role) => ({
          name: role.name,
          role: role.role,
          responsibility: role.responsibility,
          contextScope: role.contextScope,
          allowedTools: role.allowedTools ?? [],
          preloadedSkills: role.preloadedSkills ?? [],
          assignedTasks: role.assignedTasks ?? [],
          skills: role.skills ?? [],
          tools: role.tools ?? [],
          acceptance: role.acceptance ?? [],
          acceptanceCriteria: role.acceptanceCriteria ?? [],
          checkpoint: role.checkpoint,
        })),
        contract: input.contract,
        acceptanceCriteria: input.acceptance_criteria ?? [],
        maxSteps: input.max_steps ?? 12,
        autoApprove: input.autoApprove ?? false,
        rolePlan: planned.rolePlan,
        subtaskGraph: planned.subtaskGraph,
        generatedSkills: planned.generatedSkills,
        expectedArtifacts: planned.expectedArtifacts,
        verificationPlan: planned.verificationPlan,
        riskAndPermissionNotes: planned.riskAndPermissionNotes,
      });
      return {
        data: workflow,
        result: {
          action_type: input.type,
          status: "succeeded",
          message: [
            `workflow ${workflow.id} plan ${workflow.phase === "awaiting_approval" ? "awaiting approval" : "started"}`,
            `objective: ${workflow.objective}`,
            `roles: ${workflow.roles.map((role) => role.role).join(", ")}`,
            `subtasks: ${workflow.subtaskGraph.map((subtask) => `${subtask.id}:${subtask.title} -> ${subtask.assigneeRole} [${subtask.status}]`).join(" | ")}`,
            workflow.contract ? `contract outputs: ${workflow.contract.expectedOutputs.map((output) => `${output.kind}:${output.description}`).join(" | ") || "(none)"}` : "",
            workflow.phase === "awaiting_approval"
              ? "Plan gate is waiting. Use approve_agent_workflow_plan to execute, revise_agent_workflow_plan/regenerate_agent_workflow_plan to change it, or cancel_agent_workflow_plan."
              : "Plan was auto-approved; drain_agent_workflow can execute subtask-local role work.",
          ].join("\n"),
        },
      };
    },
  }),
  buildTool({
    name: "approve_agent_workflow_plan",
    displayName: "Approve Workflow Plan",
    description: "Approve a plan-gated multi-agent workflow so its dynamic roles can begin executing the subtask graph.",
    inputSchema: ApproveAgentWorkflowPlanActionSchema,
    concurrencySafe: false,
    destructive: false,
    run(input, context) {
      if (!context.state || !context.runId) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            message: "approve_agent_workflow_plan requires a run context.",
          },
        };
      }
      const workflow = new AgentWorkflowService(context.state, context.root).approvePlan({
        runId: context.runId,
        workflowId: input.workflow_id,
        note: input.note,
      });
      return {
        data: workflow,
        result: {
          action_type: input.type,
          status: "succeeded",
          message: [
            `workflow ${workflow.id} approved`,
            `phase=${workflow.phase}`,
            `subtasks=${workflow.subtaskGraph.length}`,
            "Use drain_agent_workflow to execute the approved plan.",
          ].join("\n"),
        },
      };
    },
  }),
  buildTool({
    name: "revise_agent_workflow_plan",
    displayName: "Revise Workflow Plan",
    description: "Revise the active plan-gated workflow using user instructions; the revised plan returns to awaiting approval.",
    inputSchema: ReviseAgentWorkflowPlanActionSchema,
    concurrencySafe: false,
    destructive: false,
    async run(input, context) {
      if (!context.state || !context.runId) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            message: "revise_agent_workflow_plan requires a run context.",
          },
        };
      }
      const current = new AgentWorkflowService(context.state, context.root).status(input.workflow_id).record;
      const planned = await buildWorkflowPlanForRevision(current, input.instructions, context);
      const workflow = new AgentWorkflowService(context.state, context.root).replacePlan({
        runId: context.runId,
        workflowId: input.workflow_id,
        instructions: input.instructions,
        ...planned,
      });
      return {
        data: workflow,
        result: {
          action_type: input.type,
          status: "succeeded",
          message: workflowPlanResultMessage(workflow, "revised"),
        },
      };
    },
  }),
  buildTool({
    name: "regenerate_agent_workflow_plan",
    displayName: "Regenerate Workflow Plan",
    description: "Generate a different dynamic role and subtask plan for the active workflow; it remains awaiting approval.",
    inputSchema: RegenerateAgentWorkflowPlanActionSchema,
    concurrencySafe: false,
    destructive: false,
    async run(input, context) {
      if (!context.state || !context.runId) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            message: "regenerate_agent_workflow_plan requires a run context.",
          },
        };
      }
      const current = new AgentWorkflowService(context.state, context.root).status(input.workflow_id).record;
      const planned = await buildWorkflowPlanForRevision(current, input.instructions || "Regenerate with a different role split and subtask graph.", context);
      const workflow = new AgentWorkflowService(context.state, context.root).replacePlan({
        runId: context.runId,
        workflowId: input.workflow_id,
        instructions: input.instructions || "Regenerate plan.",
        ...planned,
      });
      return {
        data: workflow,
        result: {
          action_type: input.type,
          status: "succeeded",
          message: workflowPlanResultMessage(workflow, "regenerated"),
        },
      };
    },
  }),
  buildTool({
    name: "cancel_agent_workflow_plan",
    displayName: "Cancel Workflow Plan",
    description: "Cancel an awaiting or running multi-agent workflow plan.",
    inputSchema: CancelAgentWorkflowPlanActionSchema,
    concurrencySafe: false,
    destructive: false,
    run(input, context) {
      if (!context.state || !context.runId) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            message: "cancel_agent_workflow_plan requires a run context.",
          },
        };
      }
      const workflow = new AgentWorkflowService(context.state, context.root).cancelPlan({
        runId: context.runId,
        workflowId: input.workflow_id,
        reason: input.reason,
      });
      return {
        data: workflow,
        result: {
          action_type: input.type,
          status: "succeeded",
          message: `workflow ${workflow.id} cancelled${input.reason ? `: ${input.reason}` : ""}`,
        },
      };
    },
  }),
  buildTool({
    name: "run_agent_workflow_step",
    displayName: "Agent Step",
    description: "Run one role-local step in the active multi-agent workflow using the current provider, role checkpoint, tool-result summary, and role tool policy.",
    inputSchema: RunAgentWorkflowStepActionSchema,
    concurrencySafe: false,
    destructive: false,
    async run(input, context) {
      const result = await runWorkflowStep(input, context, baseTools);
      return {
        data: result,
        result: {
          action_type: input.type,
          status: result.status === "failed" ? "failed" : "succeeded",
          message: result.message,
          context: result.message,
        },
      };
    },
  }),
  buildTool({
    name: "drain_agent_workflow",
    displayName: "Drain Workflow",
    description: "Run role-local multi-agent workflow steps until every role is complete, a role blocks, or max_steps is reached.",
    inputSchema: DrainAgentWorkflowActionSchema,
    concurrencySafe: false,
    destructive: false,
    async run(input, context) {
      if (!context.state || !context.runId) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            message: "drain_agent_workflow requires a run context.",
          },
        };
      }
      const maxSteps = Math.min(50, Math.max(1, Math.trunc(input.max_steps ?? 12)));
      const steps: Awaited<ReturnType<typeof runWorkflowStep>>[] = [];
      for (let index = 0; index < maxSteps; index += 1) {
        const step = await runWorkflowStep({
          workflow_id: input.workflow_id,
          max_turns: input.max_turns_per_role ?? 2,
        }, context, baseTools);
        steps.push(step);
        if (step.status === "idle" || step.status === "failed" || step.status === "blocked") break;
      }
      const finalStatus = steps.at(-1)?.status ?? "idle";
      const service = new AgentWorkflowService(context.state, context.root);
      let workflowStatus = "";
      try {
        workflowStatus = service.formatStatus(input.workflow_id);
      } catch {
        workflowStatus = "";
      }
      const message = [
        `workflow drain status=${finalStatus} steps=${steps.length}/${maxSteps}`,
        ...steps.map((step, index) => `${index + 1}. ${step.role ?? "none"}${step.subtaskId ? `/${step.subtaskId}` : ""} ${step.status}: ${compact(step.message, 260)}`),
        workflowStatus,
      ].filter(Boolean).join("\n");
      return {
        data: { steps, finalStatus, workflowStatus },
        result: {
          action_type: input.type,
          status: finalStatus === "failed" ? "failed" : "succeeded",
          message,
          context: message,
        },
      };
    },
  }),
  buildTool({
    name: "send_agent_message",
    displayName: "Agent Message",
    description: "Send a tracked blackboard message between roles in the active multi-agent workflow.",
    inputSchema: SendAgentMessageActionSchema,
    concurrencySafe: false,
    destructive: false,
    run(input, context) {
      if (!context.state || !context.runId) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            message: "send_agent_message requires a run context.",
          },
        };
      }
      const workflow = new AgentWorkflowService(context.state, context.root).message({
        runId: context.runId,
        workflowId: input.workflow_id,
        from: input.from ?? "supervisor",
        to: input.to,
        message: input.message,
      });
      return {
        result: {
          action_type: input.type,
          status: "succeeded",
          message: `workflow ${workflow.id}: ${input.from} -> ${input.to}: ${input.message}`,
        },
      };
    },
  }),
  buildTool({
    name: "agent_status",
    displayName: "Agent Status",
    description: "Show the active multi-agent workflow status, role tasks, and latest blackboard message.",
    inputSchema: AgentStatusActionSchema,
    readOnly: true,
    concurrencySafe: true,
    run(input, context) {
      if (!context.state) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            message: "agent_status requires state.",
          },
        };
      }
      const text = new AgentWorkflowService(context.state, context.root).formatStatus(input.workflow_id);
      return {
        result: {
          action_type: input.type,
          status: "succeeded",
          message: text,
          context: text,
        },
      };
    },
  }),
  buildTool({
    name: "finish_agent_workflow",
    displayName: "Finish Workflow",
    description: "Finish the active multi-agent workflow after the reviewer has checked acceptance criteria.",
    inputSchema: FinishAgentWorkflowActionSchema,
    concurrencySafe: false,
    destructive: false,
    run(input, context) {
      if (!context.state || !context.runId) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            message: "finish_agent_workflow requires a run context.",
          },
        };
      }
      const workflow = new AgentWorkflowService(context.state, context.root).finish({
        runId: context.runId,
        workflowId: input.workflow_id,
        status: input.status ?? "succeeded",
        summary: input.summary,
        artifacts: input.artifacts ?? [],
        issues: input.issues ?? [],
      });
      const artifacts = input.artifacts ?? [];
      const issues = input.issues ?? [];
      return {
        result: {
          action_type: input.type,
          status: input.status === "failed" ? "failed" : "succeeded",
          message: [
            `workflow ${workflow.id} ${input.status ?? "succeeded"}`,
            input.summary,
            artifacts.length ? `artifacts: ${artifacts.join(", ")}` : "",
            issues.length ? `issues: ${issues.join("; ")}` : "",
          ].filter(Boolean).join("\n"),
        },
      };
    },
  }),
  buildTool({
    name: "search_skills",
    displayName: "SearchSkills",
    description: "Search installed DeepSeekCode-compatible SKILL.md skills by name, scope, or description before invoking a specialized skill.",
    inputSchema: SearchSkillsActionSchema,
    readOnly: true,
    concurrencySafe: true,
    run(input, context) {
      const query = input.query ?? "";
      const limit = input.limit ?? 10;
      const needle = query.trim().toLowerCase();
      const skills = discoverSkills(context.root, context.dataDir ?? context.root)
        .filter((skill) => !skill.disableModelInvocation)
        .filter((skill) => {
          if (!needle) return true;
          return [skill.name, skill.scope, skill.description].join(" ").toLowerCase().includes(needle);
        })
        .slice(0, limit);
      const message = skills.length
        ? skills.map((skill) => `${skill.scope}/${skill.name} - ${skill.description || "(no description)"} (${skill.path})`).join("\n")
        : `no skills matched: ${query}`;
      return {
        data: { skills },
        result: {
          action_type: input.type,
          status: "succeeded",
          message,
          context: message,
        },
      };
    },
  }),
  buildTool({
    name: "invoke_skill",
    displayName: "Skill",
    description: "Execute a named DeepSeekCode-compatible SKILL.md skill in a forked local agent context.",
    inputSchema: InvokeSkillActionSchema,
    concurrencySafe: false,
    destructive: true,
    async run(input, context) {
      if (context.skillRunner) {
        const output = await context.skillRunner({
          name: input.name,
          task: input.task,
          maxTurns: input.max_turns,
        });
        const childSummary = output.execution.results
          .map((result) => `${result.action_type}:${result.status}${result.path ? ` ${result.path}` : ""}`)
          .join("\n");
        return {
          data: output,
          result: {
            action_type: input.type,
            status: output.execution.status,
            path: output.skill.path,
            message: [
              `skill ${output.skill.scope}/${output.skill.name} executed in ${output.turnCount} turn(s) for task: ${input.task}`,
              output.execution.final_message,
              childSummary,
            ].filter(Boolean).join("\n"),
          },
        };
      }
      const skill = loadSkill(context.root, context.dataDir ?? context.root, input.name);
      if (!skill) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            message: `skill not found: ${input.name}`,
          },
        };
      }
      const excerpt = skill.prompt.slice(0, 4000);
      return {
        data: { skill, task: input.task, prompt: excerpt },
        result: {
          action_type: input.type,
          status: "succeeded",
          path: skill.path,
          message: [
            `skill ${skill.scope}/${skill.name} loaded for task: ${input.task}`,
            excerpt,
          ].join("\n"),
        },
      };
    },
  }),
  buildTool({
    name: "create_docx",
    displayName: "DOCX",
    description: "Create a real DOCX artifact from Markdown using the runtime document tool; do not write helper scripts.",
    inputSchema: PlannedDocxActionSchema,
    destructive: true,
    async run(input, context) {
      const target = await createDocxArtifact(context.root, input);
      return {
        result: {
          action_type: input.type,
          status: "succeeded",
          path: target,
          message: "DOCX created by runtime document tool",
          artifact_kind: "docx",
        },
      };
    },
  }),
  buildTool({
    name: "create_pptx",
    displayName: "PPTX",
    description: "Create a real PPTX artifact from structured slide content using the runtime presentation tool; slides.length is the default final slide count, and include_title_slide adds one explicit cover slide.",
    inputSchema: PlannedPptxActionSchema,
    destructive: true,
    async run(input, context) {
      const target = await createPptxArtifact(context.root, input);
      const slideCount = input.slides.length + (input.include_title_slide ? 1 : 0);
      return {
        result: {
          action_type: input.type,
          status: "succeeded",
          path: target,
          message: `PPTX created by runtime presentation tool with ${slideCount} slides`,
          artifact_kind: "pptx",
        },
      };
    },
  }),
  buildTool({
    name: "create_pdf",
    displayName: "PDF",
    description: "Reserved PDF-generation action. It fails honestly until the document bridge is wired.",
    inputSchema: PlannedPdfActionSchema,
    destructive: true,
    run(input) {
      return {
        result: {
          action_type: input.type,
          status: "failed",
          path: input.path,
          message: "create_pdf is in the protocol; the TypeScript document bridge is not wired yet.",
          artifact_kind: "pdf",
        },
      };
    },
  }),
  buildTool({
    name: "computer_use",
    displayName: "Computer",
    description: "Reserved computer-use action. It stays disabled until explicit bridge permissions exist.",
    inputSchema: PlannedComputerUseActionSchema,
    destructive: true,
    permissions() {
      return {
        behavior: "deny",
        message: "computer_use requires a future explicit computer bridge permission.",
      };
    },
    run(input) {
      return {
        result: {
          action_type: input.type,
          status: "failed",
          message: "computer_use is not enabled in this TypeScript runtime yet.",
        },
      };
    },
  }),
];

interface WorkflowPlanParts {
  rolePlan?: WorkflowRolePlan;
  subtaskGraph?: WorkflowSubtaskState[];
  generatedSkills?: GeneratedRoleSkill[];
  expectedArtifacts?: string[];
  verificationPlan?: string[];
  riskAndPermissionNotes?: string[];
}

async function buildWorkflowPlanForStart(
  input: { objective: string; contract?: unknown; roles?: Array<Record<string, unknown>>; acceptance_criteria?: string[] },
  context: ToolExecutionContext,
): Promise<WorkflowPlanParts> {
  if (!context.provider) return {};
  const contract = normalizeTaskCompletionContract(input.contract as never, input.objective, input.acceptance_criteria ?? []);
  const explicitRoles = input.roles?.length ? JSON.stringify(input.roles) : "";
  return buildWorkflowPlanWithProvider({
    objective: input.objective,
    contract,
    existingPlan: explicitRoles ? `User supplied role hints:\n${explicitRoles}` : "",
    revisionInstructions: "",
    context,
  });
}

async function buildWorkflowPlanForRevision(
  record: AgentWorkflowRecord,
  instructions: string,
  context: ToolExecutionContext,
): Promise<WorkflowPlanParts> {
  if (!context.provider) return {};
  return buildWorkflowPlanWithProvider({
    objective: record.objective,
    contract: record.contract ?? normalizeTaskCompletionContract(undefined, record.objective),
    existingPlan: JSON.stringify({
      phase: record.phase,
      roles: record.roles.map((role) => ({
        role: role.role,
        responsibility: role.responsibility,
        assignedTasks: role.assignedTasks,
      })),
      subtasks: record.subtaskGraph.map((subtask) => ({
        id: subtask.id,
        title: subtask.title,
        role: subtask.assigneeRole,
        status: subtask.status,
      })),
    }),
    revisionInstructions: instructions,
    context,
  });
}

async function buildWorkflowPlanWithProvider(input: {
  objective: string;
  contract: ReturnType<typeof normalizeTaskCompletionContract>;
  existingPlan: string;
  revisionInstructions: string;
  context: ToolExecutionContext;
}): Promise<WorkflowPlanParts> {
  try {
    const reply = await input.context.provider!.completeChat([
      {
        role: "system",
        content: [
          "Return JSON only. You are the Planner for a plan-gated local multi-agent coding workflow.",
          "Planner and AcceptanceReviewer are fixed runtime roles, but they are added by the runtime. In the JSON roles array, return only the task-specific middle execution roles.",
          "If the objective is Chinese or mostly Chinese, all user-facing role names, subtask titles, role responsibilities, skill summaries, risk notes, and handoff text must be Simplified Chinese. Keep only real tool names/code paths in their original language.",
          "Generate enough middle roles for clear division of labor. Complex website/game/full-stack/data tasks should normally have 3-5 middle roles; never collapse them into one ImplementationSpecialist-style role.",
          "Role names must describe the domain work, for example 玩法关卡工程师, 动效体验工程师, 前端界面工程师, 后端数据工程师, MCP协议工程师. Avoid generic names such as ImplementationSpecialist, Builder, Worker, Frontend, Backend, Tester unless the user explicitly asked for that exact label.",
          "Every role needs responsibility, contextScope, allowedTools, requiredOutputs, riskChecks, handoffFormat, and a workflow-local generatedSkill.",
          "Each generatedSkill must be specific to that role and this workflow; include matching installed skills such as gsap-core, gsap-timeline, gsap-performance, ui-ux, browser-verification, presentations, documents, spreadsheets, pdf, mcp, or plugin-creator when relevant.",
          "Generate a subtask graph with assigneeRole, dependencies, acceptanceCriteria, expectedOutputs, and evidence requirements.",
          "No tool execution is allowed in this planning response.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Objective:\n${input.objective}`,
          `TaskCompletionContract:\n${JSON.stringify(input.contract)}`,
          input.existingPlan ? `Existing/hinted plan:\n${input.existingPlan}` : "",
          input.revisionInstructions ? `Revision instructions:\n${input.revisionInstructions}` : "",
          [
            "Return this JSON shape:",
            "{",
            '  "plannerNotes": "short useful note",',
            '  "roles": [{"role":"TaskSpecificRole","responsibility":"...","contextScope":"...","allowedTools":["read_file"],"preloadedSkills":["..."],"requiredOutputs":["..."],"riskChecks":["..."],"handoffFormat":"..."}],',
            '  "subtasks": [{"id":"subtask_1","title":"...","description":"...","assigneeRole":"TaskSpecificRole","dependencies":[],"acceptanceCriteria":["..."],"expectedOutputs":["..."],"evidenceRequirements":["..."]}],',
            '  "generatedSkills": [{"role":"TaskSpecificRole","summary":"...","prompt":"...","allowedTools":["read_file"],"outputFormat":"...","riskChecks":["..."],"handoffFormat":"..."}],',
            '  "expectedArtifacts": ["..."],',
            '  "verificationPlan": ["..."],',
            '  "riskAndPermissionNotes": ["..."]',
            "}",
          ].join("\n"),
        ].filter(Boolean).join("\n\n"),
      },
    ], { signal: input.context.abortSignal });
    input.context.recordUsage?.(input.context.provider!.takeLastUsage(), "agent_workflow_plan_gate");
    return normalizeProviderWorkflowPlan(parseJsonObject(reply.text), input.contract);
  } catch (error) {
    input.context.state?.appendEvent(input.context.runId ?? null, "agent_workflow_model_plan_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

function normalizeProviderWorkflowPlan(value: unknown, contract: ReturnType<typeof normalizeTaskCompletionContract>): WorkflowPlanParts {
  const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const now = Date.now();
  const roles = asArray(candidate.roles)
    .map((role) => roleFromModel(role))
    .filter((role): role is AgentRoleState => Boolean(role));
  const generatedSkills = asArray(candidate.generatedSkills)
    .map((skill, index) => generatedSkillFromModel(skill, roles, index, now))
    .filter((skill): skill is GeneratedRoleSkill => Boolean(skill));
  const subtaskGraph = asArray(candidate.subtasks)
    .map((subtask, index) => subtaskFromModel(subtask, roles, contract, index, now))
    .filter((subtask): subtask is WorkflowSubtaskState => Boolean(subtask));
  return {
    rolePlan: roles.length ? {
      source: "model",
      plannerNotes: stringValue(candidate.plannerNotes) || "Model-authored plan gate.",
      roles,
    } : undefined,
    subtaskGraph: subtaskGraph.length ? subtaskGraph : undefined,
    generatedSkills: generatedSkills.length ? generatedSkills : undefined,
    expectedArtifacts: stringArray(candidate.expectedArtifacts),
    verificationPlan: stringArray(candidate.verificationPlan),
    riskAndPermissionNotes: stringArray(candidate.riskAndPermissionNotes),
  };
}

function roleFromModel(value: unknown): AgentRoleState | undefined {
  const role = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const name = safeModelName(stringValue(role.role) || stringValue(role.name));
  const responsibility = stringValue(role.responsibility);
  if (!name || !responsibility) return undefined;
  const allowedTools = stringArray(role.allowedTools);
  const preloadedSkills = stringArray(role.preloadedSkills);
  return {
    name,
    role: name,
    responsibility,
    contextScope: stringValue(role.contextScope) || "Role-local context: current subtask, generated skill, checkpoint, tool feedback, and necessary upstream summaries only.",
    allowedTools: allowedTools.length ? allowedTools : defaultAllowedToolsForRole(name, responsibility),
    preloadedSkills,
    assignedTasks: stringArray(role.assignedSubtasks).concat(stringArray(role.assignedTasks)),
    completedTasks: [],
    transcript: [],
    toolResultSummary: [],
    checkpoint: "",
    status: "queued",
    taskIds: [],
    skills: preloadedSkills,
    tools: allowedTools,
    acceptance: stringArray(role.acceptanceCriteria).concat(stringArray(role.acceptance)),
    requiredOutputs: stringArray(role.requiredOutputs),
    riskChecks: stringArray(role.riskChecks),
    handoffFormat: stringValue(role.handoffFormat) || "summary, artifacts, evidence, blockers, next handoff",
  };
}

function generatedSkillFromModel(value: unknown, roles: AgentRoleState[], index: number, now: number): GeneratedRoleSkill | undefined {
  const skill = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const role = safeModelName(stringValue(skill.role));
  if (!role || !roles.some((candidate) => candidate.role === role)) return undefined;
  return {
    id: `skill_${role}_${index + 1}`,
    role,
    title: stringValue(skill.title) || `${role} workflow-local skill`,
    summary: stringValue(skill.summary) || `${role} role skill`,
    prompt: stringValue(skill.prompt) || `${role}: follow role responsibility, tools, acceptance criteria, and evidence handoff.`,
    allowedTools: stringArray(skill.allowedTools),
    outputFormat: stringValue(skill.outputFormat) || "checkpoint with artifacts, evidence, blockers, and handoff",
    riskChecks: stringArray(skill.riskChecks),
    handoffFormat: stringValue(skill.handoffFormat) || "summary, evidence, blockers, next handoff",
    createdAtMs: now,
  };
}

function subtaskFromModel(
  value: unknown,
  roles: AgentRoleState[],
  contract: ReturnType<typeof normalizeTaskCompletionContract>,
  index: number,
  now: number,
): WorkflowSubtaskState | undefined {
  const subtask = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const title = stringValue(subtask.title);
  const assignee = safeModelName(stringValue(subtask.assigneeRole) || stringValue(subtask.role));
  if (!title || !assignee || !roles.some((role) => role.role === assignee)) return undefined;
  const evidenceRequirements = stringArray(subtask.evidenceRequirements);
  return {
    id: safeModelSubtaskId(stringValue(subtask.id) || `subtask_${index + 1}`),
    title,
    description: stringValue(subtask.description) || title,
    assigneeRole: assignee,
    parentId: stringValue(subtask.parentId) || undefined,
    dependencies: stringArray(subtask.dependencies).map((dependency) => safeModelSubtaskId(dependency)),
    status: "queued",
    acceptanceCriteria: stringArray(subtask.acceptanceCriteria).concat(evidenceRequirements),
    expectedOutputs: stringArray(subtask.expectedOutputs),
    evidence: [],
    createdBy: "Planner",
    updatedAtMs: now,
    lastEvent: contract.objective ? `planned for ${contract.objective}` : "planned",
  };
}

function workflowPlanResultMessage(workflow: AgentWorkflowRecord, verb: string): string {
  return [
    `workflow ${workflow.id} plan ${verb}`,
    `phase=${workflow.phase}`,
    `roles=${workflow.roles.map((role) => role.role).join(", ")}`,
    `subtasks=${workflow.subtaskGraph.map((subtask) => `${subtask.id}:${subtask.title}->${subtask.assigneeRole}`).join(" | ")}`,
    "Plan is awaiting approval before execution.",
  ].join("\n");
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("workflow planner did not return valid JSON");
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean))]
    : [];
}

function safeModelName(value: string): string {
  return value.trim().replace(/\s+/g, "_").replace(/[^\w\u4e00-\u9fa5-]/g, "").slice(0, 48);
}

function safeModelSubtaskId(value: string): string {
  return value.trim().replace(/\s+/g, "_").replace(/[^\w.-]/g, "").slice(0, 64) || `subtask_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultAllowedToolsForRole(role: string, responsibility: string): string[] {
  const text = `${role} ${responsibility}`.toLowerCase();
  if (/review|acceptance|qa|test|verify|验收|测试/.test(text)) {
    return ["read_file", "list_files", "grep_files", "glob_files", "validate_artifact", "verify_task", "verify_project", "launch_project", "browser_screenshot", "agent_status", "finish_agent_workflow"];
  }
  if (/planner|计划|规划/.test(text)) {
    return ["TodoWrite", "read_file", "list_files", "grep_files", "search_skills", "send_agent_message", "agent_status"];
  }
  return ["read_file", "list_files", "grep_files", "glob_files", "write_file", "append_file", "apply_patch", "run_command", "invoke_skill", "mcp_call", "validate_artifact"];
}

interface WorkflowStepResult {
  status: "idle" | "succeeded" | "blocked" | "failed";
  workflowId?: string;
  role?: string;
  subtaskId?: string;
  taskId?: string;
  message: string;
}

async function runWorkflowStep(
  input: { workflow_id?: string; role?: string; subtask_id?: string; max_turns?: number },
  context: ToolExecutionContext,
  tools: Tools,
): Promise<WorkflowStepResult> {
  if (!context.state || !context.runId) {
    return { status: "failed", message: "workflow step requires state and runId." };
  }
  if (!context.provider) {
    return { status: "failed", message: "workflow step requires a provider in ToolExecutionContext." };
  }
  const service = new AgentWorkflowService(context.state, context.root);
  const claimed = service.claimNextSubtask({
    workflowId: input.workflow_id,
    role: input.role,
    subtaskId: input.subtask_id,
  });
  if (!claimed) {
    let status = "";
    try {
      status = service.formatStatus(input.workflow_id);
    } catch {
      status = "";
    }
    return { status: "idle", message: ["No runnable approved workflow subtask is available.", status].filter(Boolean).join("\n") };
  }
  const { record, role, subtask, task } = claimed;
  const maxTurns = Math.min(6, Math.max(1, Math.trunc(input.max_turns ?? 2)));
  const roleTools = tools.filter((tool) => !["run_agent_workflow_step", "drain_agent_workflow"].includes(tool.name));
  const allowedToolNames = allowedToolNamesForRole(role, roleTools);
  let feedback: ActionExecutionReport | undefined;
  let lastEnvelope: ActionEnvelope | undefined;
  let lastReport: ActionExecutionReport | undefined;

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    const prompt = workflowRolePrompt(record, role, subtask, service.status(record.id).messages, turn, maxTurns, feedback);
    let envelope: ActionEnvelope;
    try {
      envelope = await context.provider.planActions({
        userMessage: prompt,
        systemPrompt: buildActionSystemPrompt(),
        contextSummary: contextBundlePrompt(buildContextBundle(context.root, 10_000, record.objective)),
        feedback,
        availableToolNames: allowedToolNames,
      }, { signal: context.abortSignal });
      context.recordUsage?.(context.provider.takeLastUsage(), `agent_workflow_${role.role}_turn_${turn}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const report = workflowFailureReport(`Role ${role.role} native tool planning failed: ${message}`, "native_tool_plan");
      lastReport = report;
      feedback = {
        ...report,
        final_message: [
          report.final_message,
          "Retry with a smaller valid JSON action plan. Every TodoWrite todo must include required string fields such as content and status.",
          "If the failure came from an oversized action, split the work into fewer tool calls.",
        ].join("\n"),
      };
      if (turn < maxTurns) {
        context.state?.appendEvent(record.runId, "agent_workflow_native_tool_plan_retry", {
          workflow_id: record.id,
          role: role.role,
          subtask_id: subtask.id,
          task_id: task?.id,
          turn,
          max_turns: maxTurns,
          message: compact(message, 500),
        });
        continue;
      }
      service.recordRoleResult({
        workflowId: record.id,
        role: role.role,
        taskId: task?.id,
        subtaskId: subtask.id,
        report,
        roleStatus: turn < maxTurns ? "blocked" : "failed",
      });
      return {
        status: "failed",
        workflowId: record.id,
        role: role.role,
        subtaskId: subtask.id,
        taskId: task?.id,
        message: report.final_message,
      };
    }

    lastEnvelope = envelope;
    const policy = enforceWorkflowRoleToolPolicy(envelope, role, allowedToolNames);
    const report = policy
      ? {
        final_message: policy.message ?? `Role ${role.role} used a disallowed tool.`,
        status: "failed" as const,
        results: [policy],
      }
      : await executeToolPlan(
        roleTools,
        envelope.actions,
        {
          ...context,
          runId: record.runId,
        },
        {
          onEvent: (event) => {
            const resultMessage = event.result?.message ? compact(event.result.message, 500) : undefined;
            service.recordRoleToolEvent({
              workflowId: record.id,
              role: role.role,
              subtaskId: subtask.id,
              taskId: task?.id,
              phase: event.phase,
              action: event.action,
              resultStatus: event.result?.status,
              message: resultMessage,
            });
            context.state?.appendEvent(record.runId, `tool_${event.phase}`, {
              workflow_id: record.id,
              role: role.role,
              subtask_id: subtask.id,
              task_id: task?.id,
              action: event.action,
              result: event.result,
              started_at_ms: event.startedAtMs,
              finished_at_ms: event.finishedAtMs,
              duration_ms: event.durationMs,
            });
          },
          onBeforeTool: (tool, action, toolContext) => {
            if (!allowedToolNames.includes(action.type)) {
              return {
                action_type: action.type,
                status: "failed" as const,
                message: `Role ${role.role} is not allowed to use tool: ${action.type}. Allowed tools: ${allowedToolNames.join(", ")}`,
              };
            }
            const approval = requireApprovalForToolAction(context.approvalPolicy, tool, action, toolContext);
            if (approval) return approval;
            return undefined;
          },
        },
      ).then((results) => ({
        final_message: envelope.final_message,
        status: results.every((result) => result.status === "succeeded") ? "succeeded" as const : "failed" as const,
        results,
      }));

    lastReport = report;
    const roleStatus = report.status === "succeeded" && envelope.continue_work
      ? "running"
      : report.status === "succeeded"
        ? "succeeded"
        : turn < maxTurns
          ? "blocked"
          : "failed";
    service.recordRoleResult({
      workflowId: record.id,
      role: role.role,
      subtaskId: subtask.id,
      taskId: task?.id,
      envelopeActions: envelope.actions,
      report,
      roleStatus,
      checkpoint: workflowCheckpoint(envelope, report),
    });

    if (report.status === "succeeded" && !envelope.continue_work) {
      return {
        status: "succeeded",
        workflowId: record.id,
        role: role.role,
        subtaskId: subtask.id,
        taskId: task?.id,
        message: `Role ${role.role} completed subtask ${subtask.id}. ${compact(report.final_message || report.results.map((result) => result.message ?? result.action_type).join(" | "), 1200)}`,
      };
    }
    feedback = report.status === "succeeded" && envelope.continue_work
      ? {
        ...report,
        status: "failed",
        final_message: [
          `Role ${role.role} requested more work.`,
          report.final_message,
          envelope.remaining_work ? `remaining: ${envelope.remaining_work}` : "",
        ].filter(Boolean).join("\n"),
      }
      : report;
    if (policy) break;
  }

  const failed = lastReport?.status === "failed";
  return {
    status: failed ? "blocked" : "succeeded",
    workflowId: record.id,
    role: role.role,
    subtaskId: subtask.id,
    taskId: task?.id,
    message: [
      `Role ${role.role} stopped after ${maxTurns} turn(s) on subtask ${subtask.id}.`,
      lastEnvelope?.remaining_work ? `remaining=${lastEnvelope.remaining_work}` : "",
      lastReport?.final_message ?? "",
      ...(lastReport?.results ?? []).slice(-4).map((result) => `${result.action_type}:${result.status}${result.message ? ` ${compact(result.message, 240)}` : ""}`),
    ].filter(Boolean).join("\n"),
  };
}

function workflowRolePrompt(
  record: AgentWorkflowRecord,
  role: AgentRoleState,
  subtask: WorkflowSubtaskState,
  messages: Array<{ from: string; to: string; message: string; createdAtMs: number }>,
  turn: number,
  maxTurns: number,
  feedback?: ActionExecutionReport,
): string {
  const peerSummaries = record.roles
    .filter((candidate) => candidate.role !== role.role)
    .map((candidate) => [
      `${candidate.role} status=${candidate.status}`,
      candidate.checkpoint ? `checkpoint=${compact(candidate.checkpoint, 500)}` : "",
      candidate.blockedBy ? `blocked=${compact(candidate.blockedBy, 260)}` : "",
    ].filter(Boolean).join(" "))
    .filter(Boolean)
    .join("\n");
  const relevantMessages = messages
    .filter((message) => message.to === "all" || message.to === role.role || message.from === role.role || message.from === "user" || message.from === "supervisor")
    .slice(-12)
    .map((message) => `- ${message.from} -> ${message.to}: ${compact(message.message, 400)}`)
    .join("\n");
  const generatedSkill = record.generatedSkills.find((skill) => skill.id === role.generatedSkillId || skill.role === role.role);
  const dependencySummaries = subtask.dependencies
    .map((dependency) => record.subtaskGraph.find((candidate) => candidate.id === dependency))
    .filter((candidate): candidate is WorkflowSubtaskState => Boolean(candidate))
    .map((candidate) => `- ${candidate.id} ${candidate.status}: ${candidate.title}${candidate.evidence.length ? ` evidence=${candidate.evidence.slice(-3).join(" | ")}` : ""}`)
    .join("\n");
  return [
    `Workflow role: ${role.role}`,
    `Turn: ${turn}/${maxTurns}`,
    `Objective: ${record.objective}`,
    `Workflow phase: ${record.phase}`,
    `Active subtask: ${subtask.id}`,
    `Subtask title: ${subtask.title}`,
    `Subtask status before this step: ${subtask.status}`,
    `Subtask description: ${subtask.description}`,
    `Subtask expected outputs: ${subtask.expectedOutputs.join(" | ") || "(none)"}`,
    `Subtask acceptance: ${subtask.acceptanceCriteria.join(" | ") || "(none)"}`,
    dependencySummaries ? `Satisfied dependency summaries:\n${dependencySummaries}` : "",
    record.contract ? [
      "TaskCompletionContract:",
      `objective=${record.contract.objective}`,
      `expectedOutputs=${record.contract.expectedOutputs.map((output) => `${output.kind}:${output.description}${output.required ? "" : " optional"}`).join(" | ") || "(none)"}`,
      `acceptanceCriteria=${record.contract.acceptanceCriteria.join(" | ") || "(none)"}`,
      `userConstraints=${record.contract.userConstraints.join(" | ") || "(none)"}`,
      `verificationHints=${record.contract.verificationHints.join(" | ") || "(none)"}`,
    ].join("\n") : "",
    `Responsibility: ${role.responsibility}`,
    `Context scope: ${role.contextScope}`,
    generatedSkill ? `Workflow-local role skill:\n${generatedSkill.prompt}` : "",
    `Allowed tools: ${allowedToolList(role)}`,
    `Preloaded skills: ${role.preloadedSkills.join(", ") || "(none)"}`,
    `Assigned tasks:\n${role.assignedTasks.map((task) => `- ${task}`).join("\n")}`,
    role.acceptance.length ? `Role acceptance:\n${role.acceptance.map((item) => `- ${item}`).join("\n")}` : "",
    role.checkpoint ? `Your checkpoint:\n${role.checkpoint}` : "",
    role.toolResultSummary.length ? `Your recent tool_result summary:\n${role.toolResultSummary.slice(-8).map((item) => `- ${compact(item, 500)}`).join("\n")}` : "",
    peerSummaries ? `Peer role summaries:\n${peerSummaries}` : "",
    relevantMessages ? `Supervisor/user/role messages:\n${relevantMessages}` : "",
    feedback ? `Previous feedback for this role:\n${feedback.final_message}\n${feedback.results.map((result) => `- ${result.action_type}:${result.status} ${compact(result.message ?? "", 300)}`).join("\n")}` : "",
    "Act only as this role. Use native tools for concrete local work. Keep outputs concise. If your role needs more work, set continue_work=true and state the next concrete step. If your assigned role is complete, set continue_work=false with a concise checkpoint summary.",
  ].filter(Boolean).join("\n\n");
}

function allowedToolNamesForRole(role: AgentRoleState, tools: Tools): string[] {
  const available = tools.map((tool) => tool.name);
  if (!role.allowedTools.length) return available;
  return role.allowedTools.filter((name) => available.includes(name));
}

function allowedToolList(role: AgentRoleState): string {
  return role.allowedTools.length ? role.allowedTools.join(", ") : "inherited runtime tools";
}

function enforceWorkflowRoleToolPolicy(
  envelope: ActionEnvelope,
  role: AgentRoleState,
  allowedToolNames: string[],
): ActionResult | undefined {
  for (const action of envelope.actions) {
    const type = actionType(action);
    if (!allowedToolNames.includes(type)) {
      return {
        action_type: type,
        status: "failed",
        message: `Role ${role.role} is not allowed to use tool: ${type}. Allowed tools: ${allowedToolNames.join(", ")}`,
      };
    }
  }
  return undefined;
}

function workflowCheckpoint(envelope: ActionEnvelope, report: ActionExecutionReport): string {
  return compact([
    envelope.final_message,
    envelope.remaining_work ? `remaining=${envelope.remaining_work}` : "",
    ...report.results.map((result) => `${result.action_type}:${result.status}${result.path ? ` ${result.path}` : ""}${result.message ? ` ${compact(result.message, 180)}` : ""}`),
  ].filter(Boolean).join(" | "), 1600);
}

function workflowFailureReport(message: string, actionTypeName: string): ActionExecutionReport {
  return {
    final_message: message,
    status: "failed",
    results: [{
      action_type: actionTypeName,
      status: "failed",
      message,
    }],
  };
}

function compact(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 3)}...`;
}

function commandContext(output: CommandOutput): string {
  return [
    `cwd=${output.cwd}`,
    `exitCode=${output.exitCode ?? "unknown"}`,
    output.timedOut ? "timedOut=true" : "",
    output.stdout.trim() ? `<stdout>\n${output.stdout.trim()}\n</stdout>` : "",
    output.stderr.trim() ? `<stderr>\n${output.stderr.trim()}\n</stderr>` : "",
  ].filter(Boolean).join("\n");
}

function actionContent(input: { content?: string; content_lines?: string[] }): string {
  if (typeof input.content === "string") return input.content;
  if (Array.isArray(input.content_lines)) return input.content_lines.join("\n");
  throw new Error("write action requires content or content_lines");
}

function hasApprovedParsedToolAction(
  context: { state?: Parameters<typeof hasApprovedToolAction>[0] },
  input: unknown,
): boolean {
  const parsed = ActionRequestSchema.safeParse(input);
  return parsed.success && hasApprovedToolAction(context.state, parsed.data);
}

function recordBrowserTool(
  dataDir: string | undefined,
  input: {
    action: "open" | "snapshot" | "screenshot" | "click" | "type";
    url: string;
    status: "succeeded" | "failed";
    message?: string;
    finalUrl?: string;
    selector?: string;
    path?: string;
    title?: string;
    bytes?: number;
    textChars?: number;
  },
): void {
  if (!dataDir) return;
  new BrowserTrajectoryRecorder(dataDir).record({
    ...input,
    source: "tool",
  });
}
