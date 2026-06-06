import type { RuntimeConfig } from "../bootstrap/config.js";
import { buildRepositoryMap, repositoryMapPrompt } from "../context/repositoryMap.js";
import { recordUsageSnapshot } from "../cost-tracker.js";
import { executeEnvelope } from "../tools/executor.js";
import { buildActionSystemPrompt } from "../query/systemPrompt.js";
import type { ActionEnvelope, ActionExecutionReport } from "../protocol/actions.js";
import type { DeepSeekProviderClient, UsageSnapshot } from "../protocol/provider.js";
import type { RuntimePermissionState } from "../services/permissions/permissionProfiles.js";
import { HookService } from "../services/hooks/hookService.js";
import { toolRunEventPayload, toolRunEventToHookEvent } from "../services/hooks/toolHookBridge.js";
import { buildRunStateContext } from "../services/session/runStateContext.js";
import { getCurrentSessionId } from "../services/session/resumeService.js";
import { SessionStorage } from "../services/session/sessionStorage.js";
import { compactActionReport, formatToolResultSummary } from "../services/session/toolResultSummary.js";
import { buildRequestDiagnostics } from "../services/telemetry/requestDiagnostics.js";
import type { StateStore } from "../state/sqlite.js";
import { defaultShellPolicy } from "../tools/shell.js";
import { FileStateCache } from "../utils/fileStateCache.js";

export interface ProviderMultiAgentInput {
  goal: string;
  config: RuntimeConfig;
  state: StateStore;
  provider: DeepSeekProviderClient;
  permissions: RuntimePermissionState;
  onUsage?: (usage: UsageSnapshot) => void;
  onRunCreated?: (runId: string) => void | Promise<void>;
}

const ROLE_CHAIN = [
  {
    agent: "Planner",
    title: "Plan scope and acceptance criteria",
    instruction: "Plan the task. Prefer reading/listing files and produce a concise plan. Do not use EnterPlanMode, ExitPlanMode, or AskUserQuestion.",
  },
  {
    agent: "Builder",
    title: "Implement artifact or code changes",
    instruction: "Implement the requested change through write_file/apply_patch actions when needed.",
  },
  {
    agent: "Tester",
    title: "Validate outputs",
    instruction: "Validate generated artifacts or run safe checks. Use validate_artifact when files were produced.",
  },
  {
    agent: "Reviewer",
    title: "Review and decide acceptance",
    instruction: "Review evidence. If validation failed, request rework through a clear final_message. Do not use EnterPlanMode, ExitPlanMode, or AskUserQuestion.",
  },
] as const;

export async function runProviderMultiAgent(input: ProviderMultiAgentInput): Promise<string> {
  const runId = input.state.createRun({
    projectPath: input.config.projectPath,
    model: input.provider.model,
    message: `/multi provider ${input.goal}`,
  });
  const repositoryMap = buildRepositoryMap(input.config.projectPath, 240);
  const fileStateCache = new FileStateCache();
  const hookService = new HookService(input.config.projectPath, input.config.dataDir);
  input.state.saveContextSnapshot(runId, "repository_map_v1", repositoryMap);

  const taskIds = createRoleTasks(input.state, runId);
  try {
    await input.onRunCreated?.(runId);
    input.state.appendEvent(runId, "agent_dashboard_started", {
      source: "provider_multi_agent",
      mode: "auto",
    });
  } catch (error) {
    input.state.appendEvent(runId, "agent_dashboard_failed", {
      source: "provider_multi_agent",
      message: error instanceof Error ? error.message : String(error),
    });
  }
  let feedback = "";
  const systemPrompt = buildProviderMultiAgentSystemPrompt();
  const contextSummary = repositoryMapPrompt(repositoryMap);
  const maxRoleAttempts = 3;

  for (let index = 0; index < ROLE_CHAIN.length; index += 1) {
    const role = ROLE_CHAIN[index];
    const taskId = taskIds[index];
    input.state.updateTaskStatus(taskId, "running", role.instruction);
    input.state.appendEvent(runId, "agent_turn_started", {
      task_id: taskId,
      agent: role.agent,
      title: role.title,
    });

    let roleFeedback = "";
    let roleSucceeded = false;
    for (let attempt = 0; attempt < maxRoleAttempts; attempt += 1) {
      const userMessage = [
        `Global goal: ${input.goal}`,
        `Current role: ${role.agent}`,
        `Role instruction: ${role.instruction}`,
        currentRunStatePrompt(input.state, input.config.projectPath),
        feedback ? `Previous role feedback:\n${feedback}` : "No previous role feedback.",
        roleFeedback
          ? `Previous attempt tool_result for this same role:\n${roleFeedback}\nContinue from this tool_result. Do not repeat successful writes unless repair is required.`
          : "No previous attempt feedback for this role.",
      ].join("\n\n");
      input.state.appendEvent(runId, "provider_request_diagnostics", buildRequestDiagnostics({
        provider: input.provider.providerName,
        model: input.provider.model,
        kind: "native_tool_plan",
        systemText: systemPrompt,
        userText: userMessage,
      }));
      let envelope;
      try {
        envelope = await input.provider.planActions({
          userMessage,
          systemPrompt,
          contextSummary,
          availableToolNames: availableToolNamesForPermissions(input.permissions),
        });
      } catch (error) {
        const usage = input.provider.takeLastUsage();
        if (usage) {
          input.state.recordUsage(runId, usage, `multi_agent_${role.agent.toLowerCase()}_failed_attempt_${attempt + 1}`);
          recordUsageSnapshot(usage);
          input.onUsage?.(usage);
        }
        const message = error instanceof Error ? error.message : String(error);
        input.state.appendEvent(runId, "agent_turn_plan_failed", {
          task_id: taskId,
          agent: role.agent,
          attempt: attempt + 1,
          message,
        });
        if (attempt + 1 < maxRoleAttempts) {
          roleFeedback = [
            `Provider native tool planning failed: ${message}`,
            "Retry with valid native tool calls. Use content_lines for Markdown or multiline text files.",
          ].join("\n");
          input.state.updateTaskStatus(taskId, "running", `Retrying ${role.agent} after native tool planning failed.`);
          continue;
        }
        input.state.updateTaskStatus(taskId, "failed", message);
        input.state.updateRunStatus(runId, "failed", `multi-agent flow failed in ${role.agent}`);
        input.state.appendEvent(runId, "agent_turn_failed", {
          task_id: taskId,
          agent: role.agent,
          status: "failed",
          message,
        });
        return [
          "Multi-agent flow failed.",
          `Failed role: ${role.agent}.`,
          "The provider failed native tool planning; prompt audit and trace were recorded for diagnosis.",
        ].join(" ");
      }
      const usage = input.provider.takeLastUsage();
      if (usage) {
        input.state.recordUsage(runId, usage, `multi_agent_${role.agent.toLowerCase()}_attempt_${attempt + 1}`);
        recordUsageSnapshot(usage);
        input.onUsage?.(usage);
      }
      input.state.saveCheckpoint(runId, `${role.agent}:native_tool_plan_attempt_${attempt + 1}`, envelope);

      const report = await executeEnvelope(input.config.projectPath, envelope, {
        shellPolicy: { ...defaultShellPolicy, allowShell: input.permissions.allowShell },
        browserPolicy: { allowBrowser: input.permissions.allowBrowser },
        dataDir: input.config.dataDir,
        fileStateCache,
        onToolEvent: async (event) => {
          input.state.appendEvent(runId, `tool_${event.phase}`, {
            task_id: taskId,
            agent: role.agent,
            action: event.action,
            result: event.result,
          });
          const hookEvent = toolRunEventToHookEvent(event);
          const hookPayload = toolRunEventPayload(event);
          if (event.phase === "start") {
            const decision = await hookService.runPreToolUse(
              hookPayload,
              { allowShell: input.permissions.allowShell },
            );
            if (decision.results.length > 0) {
              input.state.appendEvent(runId, "hooks_executed", {
                task_id: taskId,
                agent: role.agent,
                tool_phase: event.phase,
                hook_event: hookEvent,
                blocked: decision.blocked,
                reason: decision.reason,
                results: decision.results,
              });
            }
            if (decision.blocked) {
              return {
                action_type: event.action.type,
                status: "failed" as const,
                message: decision.reason ?? "blocked by PreToolUse hook",
              };
            }
            return;
          }
          const hookResults = await hookService.runEvent(
            hookEvent,
            hookPayload,
            { allowShell: input.permissions.allowShell },
          );
          if (hookResults.length > 0) {
            input.state.appendEvent(runId, "hooks_executed", {
              task_id: taskId,
              agent: role.agent,
              tool_phase: event.phase,
              hook_event: hookEvent,
              results: hookResults,
            });
          }
        },
      });
      const compactReport = compactActionReport(report);
      input.state.recordActionResults(runId, report);
      saveAgentProgressCheckpoint(input.state, runId, role.agent, attempt + 1, envelope, compactReport);
      persistAgentToolSummary(input, runId, role.agent, attempt + 1, compactReport);
      feedback = formatToolResultSummary(compactReport, {
        runId,
        attempt: attempt + 1,
        note: `multi-agent ${role.agent}`,
      });

      if (!envelope.needs_local_tools || compactReport.status === "succeeded") {
        input.state.updateTaskStatus(taskId, "succeeded", envelope.final_message || compactReport.final_message);
        input.state.appendEvent(runId, "agent_turn_finished", {
          task_id: taskId,
          agent: role.agent,
          status: "succeeded",
          attempts: attempt + 1,
        });
        roleSucceeded = true;
        break;
      }

      roleFeedback = feedback;
      input.state.appendEvent(runId, "agent_turn_retry", {
        task_id: taskId,
        agent: role.agent,
        attempt: attempt + 1,
        feedback: compactReport,
      });
      if (attempt + 1 < maxRoleAttempts) {
        input.state.updateTaskStatus(taskId, "running", `Retrying ${role.agent} after failed tool result.`);
        continue;
      }

      const reworkTaskId = input.state.createTask({
        runId,
        parentTaskId: taskId,
        agent: "Builder",
        title: `Rework: ${role.title}`,
        detail: feedback,
        status: "queued",
      });
      input.state.addTaskDependency(reworkTaskId, taskId);
      input.state.updateTaskStatus(taskId, "failed", compactReport.final_message);
      input.state.updateRunStatus(runId, "paused", "multi-agent flow paused: rework is required");
      input.state.appendEvent(runId, "rework_task_queued", {
        from_task_id: taskId,
        rework_task_id: reworkTaskId,
        feedback: compactReport,
      });
      return [
        "Multi-agent flow paused.",
        `Failed role: ${role.agent}.`,
        "Rework task queued.",
        "Details are available in the latest run trace.",
      ].join(" ");
    }
    if (roleSucceeded) continue;
  }

  input.state.updateRunStatus(runId, "succeeded", "multi-agent flow completed");
  return "Multi-agent flow completed. Details are available in the latest run trace.";
}

const shellToolNames = new Set(["run_command", "ssh_run", "ssh_read_file", "ssh_write_file"]);
const browserToolNames = new Set([
  "browser_session_start",
  "browser_snapshot",
  "browser_screenshot",
  "browser_click",
  "browser_type",
]);

function availableToolNamesForPermissions(permissions: RuntimePermissionState): string[] {
  const common = [
    "read_file",
    "list_files",
    "write_file",
    "append_file",
    "glob_files",
    "grep_files",
    "apply_patch",
    "mcp_call",
    "tdai_memory_search",
    "tdai_conversation_search",
    "TodoWrite",
    "EnterPlanMode",
    "AskUserQuestion",
    "ExitPlanMode",
    "validate_artifact",
    "create_docx",
    "create_pptx",
    "create_pdf",
    "computer_use",
    "search_skills",
    "invoke_skill",
    "invoke_agent",
  ];
  const conditional = [
    ...Array.from(shellToolNames).filter(() => permissions.allowShell),
    ...Array.from(browserToolNames).filter(() => permissions.allowBrowser),
  ];
  return [...common, ...conditional];
}

function createRoleTasks(state: StateStore, runId: string): string[] {
  const taskIds: string[] = [];
  for (const role of ROLE_CHAIN) {
    const taskId = state.createTask({
      runId,
      agent: role.agent,
      title: role.title,
      detail: role.instruction,
    });
    const previous = taskIds.at(-1);
    if (previous) state.addTaskDependency(taskId, previous);
    taskIds.push(taskId);
  }
  return taskIds;
}

function currentRunStatePrompt(state: StateStore, projectPath: string): string {
  const runState = buildRunStateContext(state, projectPath, { maxRuns: 2, maxChars: 3_000 });
  return runState.trim()
    ? `<runtime_run_state>\n${runState}\n</runtime_run_state>`
    : "No durable run state yet.";
}

function saveAgentProgressCheckpoint(
  state: StateStore,
  runId: string,
  agent: string,
  attempt: number,
  envelope: ActionEnvelope,
  report: ActionExecutionReport,
): void {
  const snapshot = {
    agent,
    attempt,
    task_kind: envelope.task_kind,
    acceptance_criteria: envelope.acceptance_criteria ?? [],
    continue_work: envelope.continue_work ?? false,
    remaining_work: envelope.remaining_work ?? "",
    planned_actions: envelope.actions.map((action) => summarizePlannedAction(action)),
    report: {
      status: report.status,
      final_message: report.final_message,
      results: report.results.map((result) => ({
        action_type: result.action_type,
        status: result.status,
        path: result.path,
        artifact_kind: result.artifact_kind,
        message: result.message ? compact(result.message.replace(/\s+/g, " ").trim(), 500) : undefined,
      })),
    },
  };
  state.saveCheckpoint(runId, `${agent}:run_progress_attempt_${attempt}`, snapshot);
  state.appendEvent(runId, "agent_progress_checkpoint", {
    agent,
    attempt,
    task_kind: envelope.task_kind,
    action_count: envelope.actions.length,
    status: report.status,
    result_count: report.results.length,
    continue_work: envelope.continue_work ?? false,
    remaining_work: envelope.remaining_work ?? "",
  });
}

function persistAgentToolSummary(
  input: ProviderMultiAgentInput,
  runId: string,
  agent: string,
  attempt: number,
  report: ActionExecutionReport,
): void {
  const sessionId = getCurrentSessionId(input.state, input.config.projectPath);
  if (!sessionId) return;
  const text = formatToolResultSummary(report, {
    runId,
    attempt,
    note: `multi-agent ${agent}`,
  });
  new SessionStorage(input.config.dataDir, sessionId).append({ role: "tool", text, runId });
  input.state.appendEvent(runId, "tool_result_summary_persisted", {
    session_id: sessionId,
    agent,
    attempt,
    chars: text.length,
    result_count: report.results.length,
    status: report.status,
  });
}

function summarizePlannedAction(action: ActionEnvelope["actions"][number]): Record<string, unknown> {
  const candidate = action as Record<string, unknown>;
  return {
    type: candidate.type,
    path: typeof candidate.path === "string" ? candidate.path : undefined,
    command: typeof candidate.command === "string" ? compact(candidate.command, 180) : undefined,
    skill: typeof candidate.skill === "string" ? candidate.skill : undefined,
    expected_kind: typeof candidate.expected_kind === "string" ? candidate.expected_kind : undefined,
    question_count: Array.isArray(candidate.questions) ? candidate.questions.length : undefined,
  };
}

function buildProviderMultiAgentSystemPrompt(): string {
  return [
    buildActionSystemPrompt(),
    "",
    "Provider multi-agent role rules:",
    "- This is an internal role turn in a running multi-agent flow, not an interactive planning session.",
    "- Do not use EnterPlanMode, ExitPlanMode, or AskUserQuestion in provider multi-agent role turns.",
    "- Planner should inspect context and write a concise final_message plan or TodoWrite status only.",
    "- Builder should make concrete file changes when requested.",
    "- Tester should validate artifacts or inspect generated files.",
    "- Reviewer should read/validate evidence and return a concise acceptance or rework message.",
  ].join("\n");
}

function compact(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}
