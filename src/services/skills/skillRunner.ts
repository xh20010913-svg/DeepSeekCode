import type { RuntimeConfig } from "../../bootstrap/config.js";
import { recordUsageSnapshot } from "../../cost-tracker.js";
import { buildContextBundle, contextBundlePrompt } from "../../context/contextBundle.js";
import type { ActionEnvelope, ActionExecutionReport, ActionRequest, ActionResult } from "../../protocol/actions.js";
import type { DeepSeekProviderClient, UsageSnapshot } from "../../protocol/provider.js";
import { buildActionSystemPrompt } from "../../query/systemPrompt.js";
import { buildStablePromptBlock } from "../../query/promptCache.js";
import type { StateStore } from "../../state/sqlite.js";
import { loadSkill, type LoadedSkill } from "../../skills/loader.js";
import { executeEnvelope } from "../../tools/executor.js";
import { defaultShellPolicy } from "../../tools/shell.js";
import type { RuntimePermissionState } from "../permissions/permissionProfiles.js";
import { buildRequestDiagnostics } from "../telemetry/requestDiagnostics.js";
import { buildResonixPromptPlan } from "../cache/resonixPolicy.js";

export interface SkillRunResult {
  skill: LoadedSkill;
  envelope: ActionEnvelope;
  execution: ActionExecutionReport;
  turns: SkillRunTurn[];
}

export interface SkillRunTurn {
  index: number;
  envelope: ActionEnvelope;
  execution: ActionExecutionReport;
}

export async function runSkillTask(input: {
  name: string;
  task: string;
  config: RuntimeConfig;
  provider: DeepSeekProviderClient;
  permissions: RuntimePermissionState;
  maxTurns?: number;
  state?: StateStore;
  runId?: string;
  signal?: AbortSignal;
  onUsage?: (usage: UsageSnapshot, source: string) => void;
}): Promise<SkillRunResult> {
  const skill = loadSkill(input.config.projectPath, input.config.dataDir, input.name);
  if (!skill) throw new Error(`skill not found: ${input.name}`);
  if (skill.frontmatter.disableModelInvocation) {
    throw new Error(`skill ${skill.name} disables model invocation`);
  }

  const bundle = buildContextBundle(input.config.projectPath, 12_000, input.task);
  const turns: SkillRunTurn[] = [];
  let feedback: ActionExecutionReport | undefined;
  const maxTurns = normalizeMaxTurns(input.maxTurns);

  for (let index = 1; index <= maxTurns; index += 1) {
    const systemPrompt = buildActionSystemPrompt();
    const stable = buildStablePromptBlock([{ title: "deepseekcode_immutable_runtime", body: systemPrompt }]);
    const promptPlan = buildResonixPromptPlan([
      {
        title: "skill_task",
        priority: "request",
        body: [
          `Skill: ${skill.name}`,
          `Task: ${input.task}`,
          `Turn: ${index}/${maxTurns}`,
          `Description: ${skill.description || skill.frontmatter.description || "(none)"}`,
          "You are already inside this forked skill run. Do not invoke this same skill again; use concrete tools to complete the task.",
        ].join("\n"),
      },
      { title: "skill_instructions", priority: "project", body: skill.prompt },
      { title: "selected_context", priority: "context", body: contextBundlePrompt(bundle) },
      ...(feedback ? [{ title: "previous_tool_feedback", priority: "feedback" as const, body: feedback.final_message }] : []),
    ], {
      maxDynamicChars: 8_000,
      stableHash: stable.hash,
      phase: `skill_${skill.name}_turn_${index}`,
    });
    input.state?.appendEvent(input.runId ?? null, "provider_request_diagnostics", buildRequestDiagnostics({
      provider: input.provider.providerName,
      model: input.provider.model,
      kind: "native_tool_plan",
      systemText: systemPrompt,
      userText: promptPlan.userMessage,
      stablePrefixHash: stable.hash,
    }));
    input.state?.appendEvent(input.runId ?? null, "skill_native_tool_plan_started", {
      skill: skill.name,
      turn: index,
      max_turns: maxTurns,
      prompt_budget: {
        stable_hash: promptPlan.stableHash,
        dynamic_hash: promptPlan.dynamicHash,
        dynamic_chars: promptPlan.dynamicChars,
        dropped_chars: promptPlan.droppedChars,
        dropped_blocks: promptPlan.droppedBlocks,
      },
    });
    const envelope = await input.provider.planActions({
      userMessage: promptPlan.userMessage,
      systemPrompt,
      contextSummary: "",
      feedback,
    }, {
      signal: input.signal,
    });
    const planUsage = input.provider.takeLastUsage();
    const usageSource = `skill_${skill.name}_native_tool_plan_turn_${index}`;
    if (planUsage && input.onUsage) {
      input.onUsage(planUsage, usageSource);
    } else if (planUsage && input.state && input.runId) {
      input.state.recordUsage(input.runId, planUsage, usageSource);
      recordUsageSnapshot(planUsage);
    }
    const execution = await executeEnvelope(input.config.projectPath, envelope, {
      shellPolicy: { ...defaultShellPolicy, allowShell: input.permissions.allowShell },
      browserPolicy: { allowBrowser: input.permissions.allowBrowser },
      dataDir: input.config.dataDir,
      state: input.state,
      runId: input.runId,
      abortSignal: input.signal,
      onBeforeTool: (_tool, action) => skillToolBoundary(skill.name, action),
    });
    if (input.state && input.runId) {
      input.state.recordActionResults(input.runId, execution);
      input.state.appendEvent(input.runId, "skill_action_turn_recorded", {
        skill: skill.name,
        turn: index,
        status: execution.status,
        result_count: execution.results.length,
      });
    }
    turns.push({ index, envelope, execution });
    const continuation = skillContinuation(envelope, execution);
    if (!continuation) {
      return { skill, envelope, execution, turns };
    }
    if (index === maxTurns) {
      return {
        skill,
        envelope,
        execution: {
          ...execution,
          status: "failed",
          final_message: continuation.limitMessage,
        },
        turns,
      };
    }
    feedback = continuation.feedback;
  }

  throw new Error("skill run ended without a turn");
}

function skillToolBoundary(skillName: string, action: ActionRequest): ActionResult | undefined {
  if (skillName === "presentations" && action.type === "create_docx") {
    return {
      action_type: action.type,
      status: "failed",
      path: "path" in action && typeof action.path === "string" ? action.path : undefined,
      message: [
        "presentations skill cannot create DOCX artifacts.",
        "Use create_pptx for the slide deck. If the user also needs a Word document, finish this skill and let the parent task invoke the documents skill.",
      ].join(" "),
    };
  }
  if (skillName === "documents" && action.type === "create_pptx") {
    return {
      action_type: action.type,
      status: "failed",
      path: "path" in action && typeof action.path === "string" ? action.path : undefined,
      message: [
        "documents skill cannot create PPTX artifacts.",
        "Use create_docx for the Word document. If the user also needs slides, finish this skill and let the parent task invoke the presentations skill.",
      ].join(" "),
    };
  }
  if ((skillName === "documents" || skillName === "presentations") && action.type === "write_file") {
    const target = action.path.toLowerCase();
    if (/(^|[\\/])generate_.*\.(py|js|mjs|ts)$/.test(target) || /(docx|pptx).*helper.*\.(py|js|mjs|ts)$/.test(target)) {
      return {
        action_type: action.type,
        status: "failed",
        path: action.path,
        message: "office skills must use runtime create_docx/create_pptx tools and must not write helper generation scripts into the artifact directory.",
      };
    }
  }
  return undefined;
}

function normalizeMaxTurns(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 2;
  return Math.min(6, Math.max(1, Math.trunc(value)));
}

function skillContinuation(
  envelope: ActionEnvelope,
  execution: ActionExecutionReport,
): { feedback: ActionExecutionReport; limitMessage: string } | null {
  if (execution.status === "failed") {
    const failures = summarizeFailedResults(execution);
    return {
      feedback: {
        ...execution,
        final_message: [execution.final_message, failures].filter(Boolean).join("\n"),
      },
      limitMessage: `Skill reached its turn limit after a failed tool batch: ${execution.final_message || "tool execution failed"}`,
    };
  }

  if (envelope.continue_work) {
    const remainingWork = envelope.remaining_work ?? "Continue the next skill action batch.";
    return {
      feedback: {
        final_message: [
          execution.final_message,
          `Continue with the next compact skill batch: ${remainingWork}`,
          hasImplementationProgress(execution)
            ? ""
            : "The last skill batch only inspected context. Continue like ClaudeCode after tool_result feedback with create_docx, create_pptx, write_file, validate_artifact, or a truthful final response.",
        ].filter(Boolean).join("\n"),
        status: execution.status,
        results: execution.results,
      },
      limitMessage: `Skill reached its turn limit before finishing: ${remainingWork}`,
    };
  }

  if (expectsImplementation(envelope) && !hasImplementationProgress(execution)) {
    const message = "Skill cannot finish an implementation or artifact task after only inspection actions.";
    return {
      feedback: {
        final_message: [
          message,
          "Continue like ClaudeCode after tool_result feedback: issue the next concrete generation, edit, or validation action, or explain why the task cannot be completed.",
        ].join("\n"),
        status: "failed",
        results: execution.results,
      },
      limitMessage: message,
    };
  }

  return null;
}

function summarizeFailedResults(report: ActionExecutionReport): string {
  return report.results
    .filter((result) => result.status === "failed")
    .map((result) => `${result.action_type} failed${result.path ? ` at ${result.path}` : ""}: ${result.message ?? "no message"}`)
    .join("\n");
}

function hasImplementationProgress(report: ActionExecutionReport): boolean {
  return report.results.some((result) =>
    [
      "write_file",
      "apply_patch",
      "run_command",
      "validate_artifact",
      "browser_screenshot",
      "create_docx",
      "create_pptx",
    ].includes(result.action_type));
}

function expectsImplementation(envelope: { task_kind?: string; acceptance_criteria?: string[] }): boolean {
  if (envelope.task_kind === "file_change" || envelope.task_kind === "document" || envelope.task_kind === "browser") {
    return true;
  }
  const criteria = (envelope.acceptance_criteria ?? []).join("\n").toLowerCase();
  return /create|write|modify|update|patch|validate|implement|integrate|生成|创建|写入|修改|更新|补丁|验证|实现|集成/.test(criteria);
}
