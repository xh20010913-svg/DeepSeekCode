import type { RuntimeConfig } from "../bootstrap/config.js";
import React, { type ReactNode } from "react";
import { runSlashCommand } from "../commands/index.js";
import { CacheGuardPanel, buildCacheGuardPanelModel } from "../components/CacheGuardPanel.js";
import { recordUsageSnapshot } from "../cost-tracker.js";
import { buildContextBundle, contextBundlePrompt } from "../context/contextBundle.js";
import { readProjectMemory } from "../memdir/projectMemory.js";
import type { ActionPlanTurn, ChatMessage, DeepSeekProviderClient, UsageSnapshot } from "../protocol/provider.js";
import type { ActionExecutionReport } from "../protocol/actions.js";
import { ApprovalService } from "../services/approval/approvalService.js";
import { resultRequiresApproval } from "../services/approval/approvalPolicy.js";
import { RollingSummary } from "../services/compact/rollingSummary.js";
import { auditCachePins } from "../services/cache/cachePinAudit.js";
import { CachePinService } from "../services/cache/cachePins.js";
import { suggestCachePins } from "../services/cache/cachePinSuggestions.js";
import { buildCachePreflightReport } from "../services/cache/cachePreflight.js";
import { CacheProfileService, buildCacheProfileForecast, matchCacheProfiles } from "../services/cache/cacheProfiles.js";
import { buildCacheReadinessReport } from "../services/cache/cacheReadiness.js";
import { CacheGuardPolicyService } from "../services/cache/cacheGuardPolicy.js";
import { CacheShapeHistoryService } from "../services/cache/cacheShapeHistory.js";
import { buildCacheStabilityReport } from "../services/cache/cacheStability.js";
import { buildCacheGuardReport, formatCacheGuardReport } from "../services/cache/cacheGuard.js";
import { summarizeCacheTelemetry } from "../services/cache/telemetry.js";
import { buildResonixPromptPlan } from "../services/cache/resonixPolicy.js";
import { HookService } from "../services/hooks/hookService.js";
import { toolRunEventPayload, toolRunEventToHookEvent } from "../services/hooks/toolHookBridge.js";
import { InferenceSettingsService } from "../services/inference/inferenceSettingsService.js";
import { OutputStyleService } from "../services/outputStyles/outputStyleService.js";
import type { RuntimePermissionState } from "../services/permissions/permissionProfiles.js";
import { WorkspaceCheckpointService } from "../services/rewind/workspaceCheckpointService.js";
import { buildRequestDiagnostics } from "../services/telemetry/requestDiagnostics.js";
import type { StateStore } from "../state/sqlite.js";
import type { CommandContext } from "../types/command.js";
import { executeEnvelope } from "../tools/executor.js";
import { baseTools } from "../tools/registry.js";
import { defaultShellPolicy } from "../tools/shell.js";
import { FileStateCache } from "../utils/fileStateCache.js";
import {
  buildStablePromptBlock,
  PrefixStabilityManager,
} from "./promptCache.js";
import { buildActionSystemPrompt } from "./systemPrompt.js";

export type QueryEvent =
  | { type: "user"; text: string }
  | { type: "assistant_delta"; text: string }
  | { type: "reasoning_delta"; text: string }
  | { type: "assistant"; text: string }
  | { type: "command"; text: string }
  | { type: "command_display"; display: ReactNode; fallbackText?: string }
  | { type: "tool_start"; text: string }
  | { type: "tool_result"; text: string }
  | { type: "error"; text: string }
  | { type: "usage"; usage: UsageSnapshot };

export interface QueryEngineOptions {
  config: RuntimeConfig;
  state: StateStore;
  provider: DeepSeekProviderClient | null;
  permissions?: RuntimePermissionState;
  requestExit?: () => void;
  requestClear?: () => void;
}

export class QueryEngine {
  private readonly config: RuntimeConfig;
  private readonly state: StateStore;
  private readonly provider: DeepSeekProviderClient | null;
  private readonly permissions: RuntimePermissionState;
  private readonly history: ChatMessage[] = [];
  private readonly requestExit?: () => void;
  private readonly requestClear?: () => void;
  private readonly actionPrefix = new PrefixStabilityManager();
  private readonly rollingSummary = new RollingSummary();
  private readonly fileStateCache = new FileStateCache();

  constructor(options: QueryEngineOptions) {
    this.config = options.config;
    this.state = options.state;
    this.provider = options.provider;
    this.permissions = options.permissions ?? {
      allowShell: options.config.shellEnabled,
      allowBrowser: options.config.browserEnabled,
      profile: options.config.permissionProfile,
    };
    this.requestExit = options.requestExit;
    this.requestClear = options.requestClear;
  }

  commandContext(): CommandContext {
    return {
      config: this.config,
      state: this.state,
      provider: this.provider,
      permissions: this.permissions,
      requestExit: this.requestExit,
      requestClear: this.requestClear,
    };
  }

  async *submit(input: string): AsyncGenerator<QueryEvent, void, void> {
    const trimmed = input.trim();
    if (!trimmed) return;
    yield { type: "user", text: trimmed };

    if (trimmed.startsWith("/")) {
      const result = await runSlashCommand(trimmed, this.commandContext());
      if (result.clear) this.requestClear?.();
      if (result.display) {
        yield { type: "command_display", display: result.display, fallbackText: result.message };
      } else if (result.message) {
        yield { type: "command", text: result.message };
      }
      if (result.submit) {
        yield* this.submit(result.submit);
      }
      if (result.exit) this.requestExit?.();
      return;
    }

    if (!this.provider) {
      yield {
        type: "error",
        text: "没有配置 DEEPSEEK_API_KEY。可以在项目 .env 里设置 DEEPSEEK_API_KEY，或先用 /doctor 检查配置。",
      };
      return;
    }

    const runId = this.state.createRun({
      projectPath: this.config.projectPath,
      model: this.provider.model,
      message: trimmed,
    });

    try {
      const classification = await this.provider.classifyTurn(trimmed);
      const classifyUsage = this.provider.takeLastUsage();
      if (classifyUsage) {
        this.state.recordUsage(runId, classifyUsage, "turn_classification");
        recordUsageSnapshot(classifyUsage);
      }
      this.state.appendEvent(runId, "provider_request_diagnostics", buildRequestDiagnostics({
        provider: this.provider.providerName,
        model: this.provider.model,
        kind: "classification",
        systemText: "classify user turn",
        userText: trimmed,
      }));
      this.state.appendEvent(runId, "turn_classified", classification);

      if (!classification.needs_local_tools) {
        yield* this.streamChatTurn(runId, trimmed);
        this.state.updateRunStatus(runId, "succeeded", "chat turn completed");
        return;
      }

      const guard = this.tryBuildPreRunCacheGuard(runId, trimmed);
      if (guard) {
        const guardPolicy = new CacheGuardPolicyService(this.config.projectPath).current();
        this.state.appendEvent(runId, "cache_guard", {
          decision: guard.decision,
          profile: guard.profile,
          policy_strict: guardPolicy.strict,
          policy_min_hit_rate: guardPolicy.minHitRate,
          policy_source: guardPolicy.source,
          preflight_status: guard.preflightStatus,
          forecast_status: guard.forecastStatus,
          readiness_score: guard.readinessScore,
          estimated_hit_rate: guard.estimatedHitRate,
          stable_tokens: guard.stableTokens,
          dynamic_tokens: guard.dynamicTokens,
          reusable_tokens: guard.reusableTokens,
          blockers: guard.blockers,
          warnings: guard.warnings,
          next_commands: guard.nextCommands,
        });
        if (guard.decision !== "run") {
          yield {
            type: "command_display",
            display: React.createElement(CacheGuardPanel, { model: buildCacheGuardPanelModel(guard) }),
            fallbackText: formatCacheGuardReport(guard),
          };
        }
        if (guard.decision === "block" && guardPolicy.strict) {
          const message = "Paused by strict DeepSeek cache guard. Fix the listed blockers or turn strict mode off with /cache guard strict off.";
          this.state.updateRunStatus(runId, "paused", message);
          yield { type: "assistant", text: `${message}\nrun=${runId}` };
          return;
        }
      }

      this.createPreActionCheckpoint(runId, trimmed);
      const pendingEvents: QueryEvent[] = [];
      let wake: (() => void) | undefined;
      let completed = false;
      let final = "";
      let actionError: unknown;
      const actionLoop = this.runActionLoop(runId, trimmed, (event) => {
        pendingEvents.push(event);
        wake?.();
      })
        .then((message) => {
          final = message;
        })
        .catch((error: unknown) => {
          actionError = error;
        })
        .finally(() => {
          completed = true;
          wake?.();
        });
      while (!completed || pendingEvents.length > 0) {
        const event = pendingEvents.shift();
        if (event) {
          yield event;
          continue;
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = undefined;
      }
      await actionLoop;
      if (actionError) throw actionError;
      this.rememberTurn(trimmed, final);
      yield { type: "assistant", text: final };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.state.updateRunStatus(runId, "failed", message);
      this.state.appendEvent(runId, "turn_failed", { message });
      this.rememberTurn(trimmed, `Previous local run failed: ${message}`);
      yield { type: "error", text: message };
    }
  }

  private async *streamChatTurn(runId: string, userMessage: string): AsyncGenerator<QueryEvent, void, void> {
    const messages = this.buildChatMessages(userMessage);
    let assistant = "";
    for await (const event of this.provider!.streamChat(messages)) {
      if (event.type === "text_delta") {
        assistant += event.text;
        yield { type: "assistant_delta", text: event.text };
      } else if (event.type === "reasoning_delta") {
        yield { type: "reasoning_delta", text: event.text };
      } else {
        this.state.recordUsage(runId, event, "chat_stream");
        recordUsageSnapshot(event);
        yield { type: "usage", usage: event };
      }
    }
    this.history.push({ role: "user", content: userMessage });
    this.history.push({ role: "assistant", content: assistant });
    this.updateRollingSummary();
    this.state.appendEvent(runId, "chat_finished", { text_chars: assistant.length });
    yield { type: "assistant", text: assistant };
  }

  private async runActionLoop(
    runId: string,
    userMessage: string,
    onEvent?: (event: QueryEvent) => void,
  ): Promise<string> {
    const inference = new InferenceSettingsService(this.config.projectPath).effective();
    if (this.config.provider) this.config.provider.maxOutputTokens = inference.maxOutputTokens;
    const projectMemory = readProjectMemory(this.config.projectPath);
    const initialContextBundle = buildContextBundle(this.config.projectPath, inference.actionContextChars, userMessage);
    this.state.saveContextSnapshot(runId, "context_bundle_v1", {
      repositoryMap: initialContextBundle.repositoryMap,
      selectedFiles: initialContextBundle.selectedFiles.map((file) => ({
        path: file.path,
        chars: file.content.length,
        truncated: file.truncated,
      })),
      approxTokens: initialContextBundle.approxTokens,
    });
    const stablePrompt = buildStablePromptBlock([
      { title: "deepseekcode_immutable_runtime", body: buildActionSystemPrompt() },
      { title: "deepseekcode_output_style", body: this.currentOutputStylePrompt() },
    ]);
    const prefixCheck = this.actionPrefix.check(stablePrompt.text, baseTools);
    this.state.appendEvent(runId, "stable_prompt_prepared", {
      hash: stablePrompt.hash,
      approx_tokens: stablePrompt.approxTokens,
      prefix_stable: prefixCheck.stable,
      prefix: prefixCheck.stable
        ? {
            combined_sha256: prefixCheck.fingerprint.combinedSha256,
          }
        : {
            drift_label: prefixCheck.drift.label,
            system_changed: prefixCheck.drift.systemChanged,
            tools_changed: prefixCheck.drift.toolsChanged,
            combined_sha256: prefixCheck.drift.current.combinedSha256,
          },
      manager: this.actionPrefix.snapshot(),
    });
    let feedback: ActionExecutionReport | undefined = undefined;
    let finalMessage = "";
    const maxActionTurns = 10;
    const trajectory: ActionPlanTurn[] = [];

    for (let attempt = 0; attempt < maxActionTurns; attempt += 1) {
      const contextBundle = attempt === 0
        ? initialContextBundle
        : buildContextBundle(this.config.projectPath, inference.actionContextChars, userMessage);
      if (attempt > 0) {
        this.state.appendEvent(runId, "context_bundle_refreshed", {
          attempt: attempt + 1,
          files: contextBundle.repositoryMap.files.length,
          selected_files: contextBundle.selectedFiles.map((file) => ({
            path: file.path,
            chars: file.content.length,
            truncated: file.truncated,
          })),
          approx_tokens: contextBundle.approxTokens,
        });
      }
      const promptPlan = buildResonixPromptPlan([
        ...new CachePinService(this.config.projectPath).promptBlocks(),
        { title: "project_memory", body: projectMemory || "(empty)", priority: "project" },
        {
          title: "project_repository_map",
          body: contextBundle.repositoryMap.files.map((file) => `${file.path} (${file.size} bytes)`).join("\n"),
          priority: "project",
        },
        { title: "selected_context", body: contextBundlePrompt(contextBundle), priority: "context" },
        { title: "current_user_request", body: userMessage, priority: "request" },
      ], { maxDynamicChars: inference.actionDynamicChars });
      this.state.appendEvent(runId, "cache_prompt_plan", {
        attempt: attempt + 1,
        effort: inference.effort,
        approx_tokens: promptPlan.approxTokens,
        dropped_chars: promptPlan.droppedChars,
        blocks: promptPlan.blocks,
      });
      let streamedPlanningReasoning = false;
      const envelope = await this.provider!.planActions({
        userMessage: promptPlan.userMessage,
        systemPrompt: stablePrompt.text,
        contextSummary: "",
        feedback,
        trajectory,
      }, {
        onReasoningDelta: (text) => {
          streamedPlanningReasoning = true;
          onEvent?.({ type: "reasoning_delta", text });
        },
      });
      const nonStreamReasoning = this.provider!.takeLastReasoning?.();
      if (!streamedPlanningReasoning && nonStreamReasoning) {
        onEvent?.({ type: "reasoning_delta", text: nonStreamReasoning });
      }
      const planUsage = this.provider!.takeLastUsage();
      this.state.appendEvent(runId, "provider_request_diagnostics", buildRequestDiagnostics({
        provider: this.provider!.providerName,
        model: this.provider!.model,
        kind: "action_plan",
        systemText: stablePrompt.text,
        userText: userMessage,
        stablePrefixHash: stablePrompt.hash,
      }));
      if (planUsage) {
        this.state.recordUsage(runId, planUsage, `action_plan_attempt_${attempt + 1}`);
        recordUsageSnapshot(planUsage);
      }
      this.state.saveCheckpoint(runId, `action_envelope_attempt_${attempt + 1}`, envelope);
      this.state.appendEvent(runId, "action_envelope_received", {
        attempt: attempt + 1,
        task_kind: envelope.task_kind,
        action_count: envelope.actions.length,
        acceptance_criteria: envelope.acceptance_criteria,
        continue_work: envelope.continue_work ?? false,
        remaining_work: envelope.remaining_work ?? "",
      });

      if (!envelope.needs_local_tools) {
        this.state.updateRunStatus(runId, "succeeded", envelope.final_message);
        return envelope.final_message || "已完成。";
      }

      const hookService = new HookService(this.config.projectPath, this.config.dataDir);
      const approvalPolicy = new ApprovalService(this.state).policy().manualToolApproval
        ? { state: this.state, runId, mode: "manual" as const }
        : undefined;
      const report = await executeEnvelope(this.config.projectPath, envelope, {
        shellPolicy: { ...defaultShellPolicy, allowShell: this.permissions.allowShell },
        browserPolicy: { allowBrowser: this.permissions.allowBrowser },
        dataDir: this.config.dataDir,
        fileStateCache: this.fileStateCache,
        approvalPolicy,
        state: this.state,
        runId,
        onToolEvent: async (event) => {
          const rendered = renderToolRunEvent(event);
          if (rendered) onEvent?.(rendered);
          this.state.appendEvent(runId, `tool_${event.phase}`, {
            action: event.action,
            result: event.result,
          });
          const hookEvent = toolRunEventToHookEvent(event);
          const payload = toolRunEventPayload(event);
          if (event.phase === "start") {
            const decision = await hookService.runPreToolUse(
              payload,
              { allowShell: this.permissions.allowShell },
            );
            if (decision.results.length > 0) {
              this.state.appendEvent(runId, "hooks_executed", {
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
                status: "failed",
                message: decision.reason ?? "blocked by PreToolUse hook",
              };
            }
            return;
          }
          const hookResults = await hookService.runEvent(
            hookEvent,
            payload,
            { allowShell: this.permissions.allowShell },
          );
          if (hookResults.length > 0) {
            this.state.appendEvent(runId, "hooks_executed", {
              tool_phase: event.phase,
              hook_event: hookEvent,
              results: hookResults,
            });
          }
        },
      });
      this.state.recordActionResults(runId, report);
      finalMessage = envelope.final_message || report.final_message;
      let trajectoryNote: string | undefined;

      const enteredPlanMode = report.results.some((result) => result.action_type === "EnterPlanMode");
      const exitedPlanMode = report.results.some((result) => result.action_type === "ExitPlanMode");
      if (enteredPlanMode && !exitedPlanMode) {
        trajectory.push({ attempt: attempt + 1, assistantEnvelope: envelope, toolReport: report, note: "Plan mode pauses execution." });
        const message = [
          "Entered plan mode; no implementation files were changed yet.",
          "For direct build requests, ask DeepSeekCode to create the first batch of files instead of entering plan mode.",
          `run=${runId}`,
        ].join("\n");
        this.state.updateRunStatus(runId, "paused", message);
        return message;
      }

      const approvalResult = report.results.find(resultRequiresApproval);
      if (approvalResult) {
        const message = approvalResult.message ?? "Approval required before continuing.";
        trajectory.push({ attempt: attempt + 1, assistantEnvelope: envelope, toolReport: report, note: "Approval gate pauses execution." });
        this.state.updateRunStatus(runId, "paused", message);
        return `${message}\nrun=${runId}`;
      }

      if (report.status === "succeeded") {
        const changedSomething = hasImplementationProgress(report);
        if (!envelope.continue_work && expectsImplementation(envelope) && !changedSomething) {
          const message = "The model claimed a file-change task was complete without changing or validating any files.";
          trajectoryNote = message;
          trajectory.push({ attempt: attempt + 1, assistantEnvelope: envelope, toolReport: report, note: trajectoryNote });
          this.state.appendEvent(runId, "action_feedback_no_progress", {
            attempt: attempt + 1,
            task_kind: envelope.task_kind,
            acceptance_criteria: envelope.acceptance_criteria,
            message,
          });
          if (attempt + 1 >= maxActionTurns) {
            this.state.updateRunStatus(runId, "failed", message);
            return `${message}\nrun=${runId}`;
          }
          feedback = {
            final_message: [
              message,
              "Continue like ClaudeCode after tool_result feedback: issue the next useful file/tool action, or truthfully explain why the request cannot be completed.",
            ].join("\n"),
            status: "failed",
            results: report.results,
          };
          continue;
        }
        if (envelope.continue_work) {
          const remainingWork = envelope.remaining_work ?? "Continue the next compact action batch.";
          this.state.appendEvent(runId, "action_batch_continue", {
            attempt: attempt + 1,
            remaining_work: remainingWork,
            implementation_progress: changedSomething,
          });
          trajectory.push({
            attempt: attempt + 1,
            assistantEnvelope: envelope,
            toolReport: report,
            note: changedSomething ? undefined : "Previous batch had no implementation progress.",
          });
          if (attempt + 1 >= maxActionTurns) {
            const message = [
              summarizeReport(finalMessage, runId, this.state.getRun(runId)?.actionCount ?? report.results.length),
              "Paused after reaching the automatic batch limit.",
              `remaining=${remainingWork}`,
            ].join("\n");
            this.state.updateRunStatus(runId, "paused", message);
            return message;
          }
          feedback = {
            final_message: [
              report.final_message,
              `Continue with the next compact batch: ${remainingWork}`,
              changedSomething
                ? ""
                : "Continue like ClaudeCode after tool_result feedback: the last batch only inspected or updated planning state. The next response must use write_file, apply_patch, validate_artifact, or set continue_work=false if the runnable result is complete.",
            ].filter(Boolean).join("\n"),
            status: report.status,
            results: report.results,
          };
          finalMessage = remainingWork;
          continue;
        }
        trajectory.push({ attempt: attempt + 1, assistantEnvelope: envelope, toolReport: report, note: trajectoryNote });
        this.state.updateRunStatus(runId, "succeeded", finalMessage);
        return summarizeReport(finalMessage, runId, this.state.getRun(runId)?.actionCount ?? report.results.length);
      }

      trajectory.push({ attempt: attempt + 1, assistantEnvelope: envelope, toolReport: report, note: "Tool report failed; retry with feedback." });
      feedback = report;
    }

    this.state.updateRunStatus(runId, "failed", finalMessage || "action loop failed");
    return `执行失败，run=${runId}。可以用 /trace ${runId} 查看失败动作。`;
  }

  private buildChatMessages(userMessage: string): ChatMessage[] {
    const system: ChatMessage = {
      role: "system",
      content:
        "You are DeepSeekCode, a Chinese-first local coding assistant. " +
        "Answer normal chat directly. Do not claim local files were changed unless the tool runtime changed them.\n\n" +
        `<output_style>\n${this.currentOutputStylePrompt()}\n</output_style>`,
    };
    const summary: ChatMessage[] = this.rollingSummary
      ? this.rollingSummary.text
        ? [{ role: "assistant", content: `<rolling_summary>\n${this.rollingSummary.text}\n</rolling_summary>` }]
        : []
      : [];
    return [system, ...summary, ...this.history.slice(-10), { role: "user", content: userMessage }];
  }

  private updateRollingSummary(): void {
    const tail = this.rollingSummary.absorb(this.history);
    this.history.splice(0, this.history.length, ...tail);
  }

  private rememberTurn(userMessage: string, assistantMessage: string): void {
    this.history.push({ role: "user", content: userMessage });
    this.history.push({ role: "assistant", content: assistantMessage });
    this.updateRollingSummary();
  }

  private currentOutputStylePrompt(): string {
    return new OutputStyleService(this.config.projectPath, this.config.dataDir).current().prompt;
  }

  private tryBuildPreRunCacheGuard(runId: string, userMessage: string) {
    try {
      return this.buildPreRunCacheGuard(userMessage);
    } catch (error) {
      this.state.appendEvent(runId, "cache_guard_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  private buildPreRunCacheGuard(userMessage: string) {
    const inference = new InferenceSettingsService(this.config.projectPath).effective();
    const contextBundle = buildContextBundle(this.config.projectPath, inference.actionContextChars, userMessage);
    const projectMemory = readProjectMemory(this.config.projectPath);
    const plan = buildResonixPromptPlan([
      ...new CachePinService(this.config.projectPath).promptBlocks(),
      { title: "project_memory", body: projectMemory || "(empty)", priority: "project" },
      {
        title: "project_repository_map",
        body: contextBundle.repositoryMap.files.map((file) => `${file.path} (${file.size} bytes)`).join("\n"),
        priority: "project",
      },
      { title: "selected_context", body: contextBundlePrompt(contextBundle), priority: "context" },
      { title: "current_user_request", body: userMessage, priority: "request" },
    ], { maxDynamicChars: inference.actionDynamicChars });
    const stability = buildCacheStabilityReport(plan);
    const shapeService = new CacheShapeHistoryService(this.config.projectPath);
    const shapeObservation = shapeService.record(stability);
    const telemetry = summarizeCacheTelemetry(this.state.listRuns(20));
    const pinAudit = auditCachePins(this.config.projectPath);
    const readiness = buildCacheReadinessReport({
      telemetry,
      pinAudit,
      shapes: shapeService.list(10),
    });
    const suggestions = suggestCachePins(this.config.projectPath, { goal: userMessage, limit: 4 });
    const policy = new CacheGuardPolicyService(this.config.projectPath).current();
    const preflight = buildCachePreflightReport({
      goal: userMessage,
      effort: inference.effort,
      plan,
      stability,
      shapeObservation,
      readiness,
      pinAudit,
      suggestions,
    });
    const profiles = new CacheProfileService(this.config.projectPath).list();
    const matches = matchCacheProfiles(profiles, userMessage, 3);
    const forecast = buildCacheProfileForecast({ goal: userMessage, preflight, matches });
    return buildCacheGuardReport({ preflight, forecast, minHitRate: policy.minHitRate });
  }

  private createPreActionCheckpoint(runId: string, userMessage: string): void {
    try {
      const checkpoint = new WorkspaceCheckpointService(this.config.projectPath).create(
        `before run ${runId}: ${compact(userMessage, 80)}`,
      );
      this.state.appendEvent(runId, "workspace_checkpoint_created", {
        checkpoint_id: checkpoint.id,
        file_count: checkpoint.fileCount,
        total_bytes: checkpoint.totalBytes,
        truncated: checkpoint.truncated,
      });
    } catch (error) {
      this.state.appendEvent(runId, "workspace_checkpoint_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function summarizeReport(finalMessage: string, runId: string, actionCount: number): string {
  const prefix = finalMessage.trim() || "已完成。";
  return `${prefix}\nrun=${runId} actions=${actionCount}`;
}

function hasImplementationProgress(report: ActionExecutionReport): boolean {
  return report.results.some((result) =>
    ["write_file", "apply_patch", "run_command", "validate_artifact", "browser_screenshot"].includes(result.action_type));
}

function expectsImplementation(envelope: { task_kind?: string; acceptance_criteria?: string[] }): boolean {
  if (envelope.task_kind === "file_change" || envelope.task_kind === "document" || envelope.task_kind === "browser") {
    return true;
  }
  const criteria = (envelope.acceptance_criteria ?? []).join("\n").toLowerCase();
  return /create|write|modify|update|patch|validate|implement|integrate|生成|创建|写入|修改|更新|补丁|验证|实现|集成/.test(criteria);
}

function renderToolRunEvent(event: import("../services/tools/toolOrchestration.js").ToolRunEvent): QueryEvent | null {
  if (event.phase === "start") {
    return {
      type: "tool_start",
      text: `${event.action.type} started${actionTarget(event.action)}`,
    };
  }
  if (!event.result) return null;
  return {
    type: "tool_result",
    text: [
      `${event.result.action_type} ${event.result.status}${event.result.path ? ` ${event.result.path}` : actionTarget(event.action)}`,
      event.result.message ?? "",
    ].filter(Boolean).join("\n"),
  };
}

function actionTarget(action: unknown): string {
  const candidate = action && typeof action === "object" ? action as Record<string, unknown> : {};
  const path = typeof candidate.path === "string" ? candidate.path : undefined;
  const command = typeof candidate.command === "string" ? candidate.command : undefined;
  const profile = typeof candidate.profile === "string" ? candidate.profile : undefined;
  if (path) return ` ${path}`;
  if (profile) return ` ${profile}`;
  if (command) return ` ${compact(command, 80)}`;
  return "";
}

function compact(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}
