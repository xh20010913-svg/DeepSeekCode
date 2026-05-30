import type { RuntimeConfig } from "../bootstrap/config.js";
import { buildRepositoryMap, repositoryMapPrompt } from "../context/repositoryMap.js";
import { executeEnvelope } from "../tools/executor.js";
import { buildActionSystemPrompt } from "../query/systemPrompt.js";
import type { DeepSeekProviderClient } from "../protocol/provider.js";
import type { RuntimePermissionState } from "../services/permissions/permissionProfiles.js";
import { HookService } from "../services/hooks/hookService.js";
import { toolRunEventPayload, toolRunEventToHookEvent } from "../services/hooks/toolHookBridge.js";
import type { StateStore } from "../state/sqlite.js";
import { defaultShellPolicy } from "../tools/shell.js";
import { FileStateCache } from "../utils/fileStateCache.js";

export interface ProviderMultiAgentInput {
  goal: string;
  config: RuntimeConfig;
  state: StateStore;
  provider: DeepSeekProviderClient;
  permissions: RuntimePermissionState;
}

const ROLE_CHAIN = [
  {
    agent: "Planner",
    title: "Plan scope and acceptance criteria",
    instruction: "Plan the task. Prefer reading/listing files and produce a concise plan.",
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
    instruction: "Review evidence. If validation failed, request rework through a clear final_message.",
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
  let feedback = "";

  for (let index = 0; index < ROLE_CHAIN.length; index += 1) {
    const role = ROLE_CHAIN[index];
    const taskId = taskIds[index];
    input.state.updateTaskStatus(taskId, "running", role.instruction);
    input.state.appendEvent(runId, "agent_turn_started", {
      task_id: taskId,
      agent: role.agent,
      title: role.title,
    });

    const envelope = await input.provider.planActions({
      userMessage: [
        `Global goal: ${input.goal}`,
        `Current role: ${role.agent}`,
        `Role instruction: ${role.instruction}`,
        feedback ? `Previous role feedback:\n${feedback}` : "No previous role feedback.",
      ].join("\n\n"),
      systemPrompt: buildActionSystemPrompt(),
      contextSummary: repositoryMapPrompt(repositoryMap),
    });
    input.state.saveCheckpoint(runId, `${role.agent}:action_envelope`, envelope);

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
        const hookResults = await hookService.runEvent(
          toolRunEventToHookEvent(event),
          toolRunEventPayload(event),
          { allowShell: input.permissions.allowShell },
        );
        if (hookResults.length > 0) {
          input.state.appendEvent(runId, "hooks_executed", {
            task_id: taskId,
            agent: role.agent,
            tool_phase: event.phase,
            hook_event: toolRunEventToHookEvent(event),
            results: hookResults,
          });
        }
      },
    });
    input.state.recordActionResults(runId, report);
    feedback = JSON.stringify(report);

    if (report.status === "succeeded") {
      input.state.updateTaskStatus(taskId, "succeeded", envelope.final_message);
      input.state.appendEvent(runId, "agent_turn_finished", {
        task_id: taskId,
        agent: role.agent,
        status: "succeeded",
      });
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
    input.state.updateTaskStatus(taskId, "failed", report.final_message);
    input.state.updateRunStatus(runId, "paused", "multi-agent flow paused: rework is required");
    input.state.appendEvent(runId, "rework_task_queued", {
      from_task_id: taskId,
      rework_task_id: reworkTaskId,
      feedback: report,
    });
    return `Multi-agent flow paused. run=${runId}; failed role=${role.agent}; rework task=${reworkTaskId}.`;
  }

  input.state.updateRunStatus(runId, "succeeded", "multi-agent flow completed");
  return `Multi-agent flow completed. run=${runId}. Use /trace ${runId} to inspect tasks, actions, artifacts, and events.`;
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
