import fs from "node:fs";
import path from "node:path";
import type { RuntimeConfig } from "../../bootstrap/config.js";
import { buildContextBundle, contextBundlePrompt } from "../../context/contextBundle.js";
import type { ActionEnvelope, ActionExecutionReport, ActionResult } from "../../protocol/actions.js";
import { actionType } from "../../protocol/actions.js";
import type { DeepSeekProviderClient } from "../../protocol/provider.js";
import type { RuntimePermissionState } from "../permissions/permissionProfiles.js";
import { executeEnvelope } from "../../tools/executor.js";
import { defaultShellPolicy } from "../../tools/shell.js";
import { loadAgent, type LoadedAgent } from "../../agents/loader.js";
import { buildActionSystemPrompt } from "../../query/systemPrompt.js";
import { buildStablePromptBlock } from "../../query/promptCache.js";
import { buildResonixPromptPlan } from "../cache/resonixPolicy.js";

export interface AgentRunResult {
  agent: LoadedAgent;
  envelope: ActionEnvelope;
  execution: ActionExecutionReport;
  turns: AgentRunTurn[];
}

export interface AgentRunTurn {
  index: number;
  envelope: ActionEnvelope;
  execution: ActionExecutionReport;
}

export async function runAgentTask(input: {
  name: string;
  task: string;
  config: RuntimeConfig;
  provider: DeepSeekProviderClient;
  permissions: RuntimePermissionState;
  feedback?: ActionExecutionReport;
  signal?: AbortSignal;
}): Promise<AgentRunResult> {
  const agent = loadAgent(input.config.projectPath, input.config.dataDir, input.name);
  if (!agent) throw new Error(`agent not found: ${input.name}`);

  const bundle = buildContextBundle(input.config.projectPath, 12_000, input.task);
  const implementationTask = expectsImplementation(input.task);
  const maxTurns = implementationTask
    ? Math.max(normalizeMaxTurns(agent.frontmatter.maxTurns), 5)
    : normalizeMaxTurns(agent.frontmatter.maxTurns);
  const turns: AgentRunTurn[] = [];
  let feedback = input.feedback;

  for (let index = 1; index <= maxTurns; index += 1) {
    let envelope: ActionEnvelope;
    try {
      const systemPrompt = buildActionSystemPrompt();
      const stable = buildStablePromptBlock([{ title: "deepseekcode_immutable_runtime", body: systemPrompt }]);
      const promptPlan = buildResonixPromptPlan([
        {
          title: "subagent_task",
          priority: "request",
          body: [
            `Subagent: ${agent.name}`,
            `Task: ${input.task}`,
            `Turn: ${index}/${maxTurns}`,
            `Description: ${agent.description || "(none)"}`,
            `Allowed tools: ${agent.tools?.join(", ") || "inherited"}`,
            `Disallowed tools: ${agent.frontmatter.disallowedTools?.join(", ") || "(none)"}`,
            `Runtime permissions: shell=${input.permissions.allowShell ? "enabled" : "disabled"} browser=${input.permissions.allowBrowser ? "enabled" : "disabled"} profile=${input.permissions.profile ?? input.config.permissionProfile}`,
            "If shell is disabled, do not use run_command, ssh_run, or shell-backed MCP calls.",
            implementationTask
              ? "This is an implementation task. A successful result must write, patch, create, or validate the requested artifact."
              : "",
            implementationTask
              ? "If the task names an exact output path, call write_file or apply_patch for that path no later than turn 2. For a single-file HTML/Markdown artifact, create a concise complete version first, then validate it."
              : "",
            implementationTask && feedback
              ? "Previous feedback already covers inspection. Do not spend this turn only reading/listing/searching files; use write_file, apply_patch, create_*, or validate_artifact now. If you cannot improve the plan, write a minimal correct artifact that satisfies the explicit request."
              : "",
          ].filter(Boolean).join("\n"),
        },
        { title: "agent_system_prompt", priority: "project", body: agent.prompt },
        { title: "selected_context", priority: "context", body: contextBundlePrompt(bundle) },
        ...(feedback ? [{ title: "previous_tool_feedback", priority: "feedback" as const, body: feedback.final_message }] : []),
      ], {
        maxDynamicChars: 8_000,
        stableHash: stable.hash,
        phase: `subagent_${agent.name}_turn_${index}`,
      });
      envelope = await input.provider.planActions({
        userMessage: promptPlan.userMessage,
        systemPrompt,
        contextSummary: "",
        feedback,
      }, {
        signal: input.signal,
      });
    } catch (error) {
      const execution = nativeToolPlanningFailure(error);
      const failedEnvelope = failureEnvelope(execution.final_message);
      turns.push({ index, envelope: failedEnvelope, execution });
      if (index < maxTurns) {
        feedback = execution;
        continue;
      }
      return { agent, envelope: failedEnvelope, execution, turns };
    }

    const policyViolation = enforceAgentToolPolicy(envelope, agent);
    const syntheticValidation = !policyViolation && implementationTask && index > 1 && isInspectionOnly(envelope)
      ? existingArtifactValidationEnvelope(input.task, input.config.projectPath, agent)
      : null;
    const executedEnvelope = syntheticValidation ?? envelope;
    const inspectionOnlyViolation = !policyViolation && !syntheticValidation && implementationTask && index > 1 && isInspectionOnly(envelope)
      ? inspectionOnlyResult(agent.name)
      : null;
    const blockedAction = policyViolation ?? inspectionOnlyViolation;
    const execution = blockedAction
      ? {
        final_message: blockedAction.message ?? "agent tool policy denied an action",
        status: "failed",
        results: [blockedAction],
      } satisfies ActionExecutionReport
      : await executeEnvelope(input.config.projectPath, executedEnvelope, {
        shellPolicy: { ...defaultShellPolicy, allowShell: input.permissions.allowShell },
        browserPolicy: { allowBrowser: input.permissions.allowBrowser },
        dataDir: input.config.dataDir,
        abortSignal: input.signal,
      });

    turns.push({ index, envelope: executedEnvelope, execution });
    const needsMoreWork = envelope.continue_work === true;
    const implementationProgress = hasImplementationProgress(execution);
    const artifactValidated = hasArtifactValidation(execution);
    if (execution.status === "succeeded" && implementationTask && artifactValidated) {
      return { agent, envelope, execution, turns };
    }
    const inspectionOnly = implementationTask && !implementationProgress;
    if (execution.status === "succeeded" && index < maxTurns && (needsMoreWork || inspectionOnly)) {
      feedback = continuationFeedback(execution, needsMoreWork
        ? "The subagent requested more work."
        : "The implementation task only inspected context and did not change or validate an artifact.");
      continue;
    }
    if (execution.status === "succeeded" && index === maxTurns && (inspectionOnly || (implementationTask && needsMoreWork))) {
      return {
        agent,
        envelope,
        execution: continuationLimitFailure(execution, needsMoreWork
          ? "The subagent still requested more work at the turn limit."
          : "The implementation task reached the turn limit without changing or validating an artifact."),
        turns,
      };
    }
    if (execution.status === "succeeded" || index === maxTurns) {
      return { agent, envelope, execution, turns };
    }
    feedback = execution;
  }

  throw new Error("agent run ended without a turn");
}

function enforceAgentToolPolicy(envelope: ActionEnvelope, agent: LoadedAgent): ActionResult | null {
  const allowed = agent.tools?.length ? new Set(agent.tools) : null;
  const disallowed = new Set(agent.frontmatter.disallowedTools ?? []);
  for (const action of envelope.actions) {
    const type = actionType(action);
    if (disallowed.has(type)) {
      return {
        action_type: type,
        status: "failed",
        message: `agent ${agent.name} is not allowed to use tool: ${type}`,
      };
    }
    if (allowed && !allowed.has(type)) {
      return {
        action_type: type,
        status: "failed",
        message: `agent ${agent.name} is not allowed to use tool: ${type}`,
      };
    }
  }
  return null;
}

function normalizeMaxTurns(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 1;
  return Math.min(8, Math.max(1, Math.trunc(value)));
}

function expectsImplementation(task: string): boolean {
  const reviewOnly =
    /(只需要读|只读|给出结论|审查|评审|review|inspect)/i.test(task) &&
    !/(实现|生成|创建|写入|修改|修复|build|create|generate|write|implement|modify|fix)/i.test(task);
  if (reviewOnly) return false;
  return /(实现|生成|创建|写入|修改|修复|验证|验收|build|create|generate|write|implement|modify|fix|validate|html|docx|pptx|pdf|markdown)/i
    .test(task);
}

function hasImplementationProgress(report: ActionExecutionReport): boolean {
  return report.results.some((result) =>
    [
      "write_file",
      "apply_patch",
      "create_docx",
      "create_pptx",
      "create_pdf",
      "validate_artifact",
      "verify_task",
      "run_command",
      "browser_screenshot",
    ].includes(result.action_type) && result.status === "succeeded");
}

function hasArtifactValidation(report: ActionExecutionReport): boolean {
  return report.results.some((result) =>
    result.action_type === "validate_artifact" && result.status === "succeeded");
}

function isInspectionOnly(envelope: ActionEnvelope): boolean {
  if (envelope.actions.length === 0) return false;
  return envelope.actions.every((action) =>
    ["read_file", "list_files", "grep_files"].includes(actionType(action)));
}

function existingArtifactValidationEnvelope(
  task: string,
  projectPath: string,
  agent: LoadedAgent,
): ActionEnvelope | null {
  if (agent.tools?.length && !agent.tools.includes("validate_artifact")) return null;
  const target = extractArtifactPath(task);
  if (!target) return null;
  const fullPath = path.resolve(projectPath, target);
  const root = path.resolve(projectPath);
  if (fullPath !== root && !fullPath.startsWith(`${root}${path.sep}`)) return null;
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) return null;
  const kind = artifactKindForPath(target);
  if (!kind) return null;
  return {
    task_kind: "tool_calling",
    needs_local_tools: true,
    acceptance_criteria: [],
    final_message: "Runtime detected the requested artifact already exists; validating it before continuing.",
    continue_work: false,
    actions: [{
      type: "validate_artifact",
      path: target.replace(/\\/g, "/"),
      expected_kind: kind,
    }],
  };
}

function extractArtifactPath(task: string): string | null {
  const match = task.match(/([\w./\\\-\u4e00-\u9fa5]+?\.(?:html|md|markdown|docx|pptx|pdf|png|jpg|jpeg))/i);
  return match?.[1] ? match[1].replace(/^["'`]+|["'`.,，。]+$/g, "") : null;
}

function artifactKindForPath(target: string): "html" | "markdown" | "docx" | "pptx" | "pdf" | "image" | null {
  const lower = target.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".pptx")) return "pptx";
  if (lower.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpg|jpeg)$/.test(lower)) return "image";
  return null;
}

function inspectionOnlyResult(agentName: string): ActionResult {
  return {
    action_type: "agent_progress_guard",
    status: "failed",
    message: [
      `agent ${agentName} produced an inspection-only turn after prior feedback.`,
      "For implementation tasks, continue with write_file, apply_patch, create_docx/create_pptx, or validate_artifact.",
    ].join(" "),
  };
}

function continuationFeedback(report: ActionExecutionReport, reason: string): ActionExecutionReport {
  return {
    ...report,
    status: "failed",
    final_message: [
      reason,
      report.final_message,
      "Continue with the next concrete tool call. For implementation tasks, write or patch the artifact and validate it before finishing.",
    ].filter(Boolean).join("\n"),
  };
}

function continuationLimitFailure(report: ActionExecutionReport, reason: string): ActionExecutionReport {
  return {
    ...report,
    status: "failed",
    final_message: [
      reason,
      report.final_message,
      "The subagent stopped before completing the requested implementation.",
    ].filter(Boolean).join("\n"),
  };
}

function nativeToolPlanningFailure(error: unknown): ActionExecutionReport {
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: "failed",
    final_message: [
      `Native tool call planning failed: ${message}`,
      "Retry with valid native tool arguments. For long multiline files, prefer write_file content_lines as a JSON string array or split the artifact into smaller apply_patch/write_file calls.",
    ].join("\n"),
    results: [{
      action_type: "native_tool_plan",
      status: "failed",
      message,
    }],
  };
}

function failureEnvelope(message: string): ActionEnvelope {
  return {
    task_kind: "tool_calling",
    needs_local_tools: true,
    acceptance_criteria: [],
    final_message: message,
    continue_work: true,
    remaining_work: "Retry native tool calls with valid arguments.",
    actions: [],
  };
}
