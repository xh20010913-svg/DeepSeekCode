import type { RuntimeConfig } from "../bootstrap/config.js";
import path from "node:path";
import React, { type ReactNode } from "react";
import { runSlashCommand } from "../commands/index.js";
import { CacheGuardPanel, buildCacheGuardPanelModel } from "../components/CacheGuardPanel.js";
import { recordUsageSnapshot } from "../cost-tracker.js";
import { buildContextBundle, contextBundlePrompt } from "../context/contextBundle.js";
import { readProjectMemory } from "../memdir/projectMemory.js";
import type { ActionPlanTurn, ChatMessage, DeepSeekProviderClient, UsageSnapshot } from "../protocol/provider.js";
import type { ActionEnvelope, ActionExecutionReport, ActionResult } from "../protocol/actions.js";
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
import type { ToolRunEvent } from "../services/tools/toolOrchestration.js";
import { InferenceSettingsService } from "../services/inference/inferenceSettingsService.js";
import { OutputStyleService } from "../services/outputStyles/outputStyleService.js";
import type { RuntimePermissionState } from "../services/permissions/permissionProfiles.js";
import { WorkspaceCheckpointService } from "../services/rewind/workspaceCheckpointService.js";
import { buildRunStateContext } from "../services/session/runStateContext.js";
import { buildSessionContext } from "../services/session/sessionContext.js";
import { getCurrentSessionId, setCurrentSessionId } from "../services/session/resumeService.js";
import { SessionStorage } from "../services/session/sessionStorage.js";
import { compactActionReport, formatToolResultSummary } from "../services/session/toolResultSummary.js";
import { runSkillTask } from "../services/skills/skillRunner.js";
import { buildRequestDiagnostics } from "../services/telemetry/requestDiagnostics.js";
import type { ApprovalGateRecord, StateStore } from "../state/sqlite.js";
import { discoverSkills } from "../skills/discovery.js";
import type { CommandContext } from "../types/command.js";
import type { QueryActivityPhase } from "../types/activity.js";
import { executeEnvelope, type ExecutionOptions } from "../tools/executor.js";
import { baseTools } from "../tools/registry.js";
import { defaultShellPolicy } from "../tools/shell.js";
import { abortReasonText, isAbortError, throwIfAborted } from "../utils/abort.js";
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
  | { type: "status"; phase: QueryActivityPhase; text: string; detail?: string }
  | { type: "usage"; usage: UsageSnapshot };

export interface QueryEngineOptions {
  config: RuntimeConfig;
  state: StateStore;
  provider: DeepSeekProviderClient | null;
  permissions?: RuntimePermissionState;
  requestExit?: () => void;
  requestClear?: () => void;
  requestModelSelector?: () => void;
  switchModel?: (model: string) => boolean;
  switchLanguage?: (language: string) => boolean;
  awaitUserDecisions?: boolean;
  sessionPersistence?: "managed" | "external" | "off";
}

export class QueryEngine {
  private readonly config: RuntimeConfig;
  private readonly state: StateStore;
  private readonly provider: DeepSeekProviderClient | null;
  private readonly permissions: RuntimePermissionState;
  private readonly history: ChatMessage[] = [];
  private readonly requestExit?: () => void;
  private readonly requestClear?: () => void;
  private readonly requestModelSelector?: () => void;
  private readonly switchModel?: (model: string) => boolean;
  private readonly switchLanguage?: (language: string) => boolean;
  private readonly awaitUserDecisions: boolean;
  private readonly sessionPersistence: "managed" | "external" | "off";
  private readonly actionPrefix = new PrefixStabilityManager();
  private readonly rollingSummary = new RollingSummary();
  private readonly fileStateCache = new FileStateCache();
  private loadedSessionId?: string;
  private activeAbortController?: AbortController;

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
    this.requestModelSelector = options.requestModelSelector;
    this.switchModel = options.switchModel;
    this.switchLanguage = options.switchLanguage;
    this.awaitUserDecisions = Boolean(options.awaitUserDecisions);
    this.sessionPersistence = options.sessionPersistence ?? "managed";
  }

  commandContext(): CommandContext {
    return {
      config: this.config,
      state: this.state,
      provider: this.provider,
      permissions: this.permissions,
      requestExit: this.requestExit,
      requestClear: this.requestClear,
      requestModelSelector: this.requestModelSelector,
      switchModel: this.switchModel,
      switchLanguage: this.switchLanguage,
    };
  }

  cancelActiveRun(reason = "user-cancel"): boolean {
    const controller = this.activeAbortController;
    if (!controller || controller.signal.aborted) return false;
    controller.abort(reason);
    return true;
  }

  isActiveRunCancellable(): boolean {
    return Boolean(this.activeAbortController && !this.activeAbortController.signal.aborted);
  }

  async *submit(input: string): AsyncGenerator<QueryEvent, void, void> {
    const trimmed = input.trim();
    if (!trimmed) return;
    yield { type: "user", text: trimmed };

    if (trimmed.startsWith("/")) {
      let result;
      const commandUsageEvents: UsageSnapshot[] = [];
      yield { type: "status", phase: "command", text: "Running slash command", detail: trimmed };
      try {
        result = await runSlashCommand(trimmed, {
          ...this.commandContext(),
          recordUsageEvent: (usage) => {
            const snapshot = usageSnapshotFromEvent(usage);
            if (hasUsageTokens(snapshot)) commandUsageEvents.push(snapshot);
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        yield { type: "error", text: `Command failed: ${message}` };
        return;
      }
      for (const usage of commandUsageEvents) {
        yield { type: "usage", usage };
      }
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
    this.ensureSessionContext(runId);
    const abortController = new AbortController();
    this.activeAbortController = abortController;
    const signal = abortController.signal;

    try {
      throwIfAborted(signal);
      yield { type: "status", phase: "classifying", text: "Classifying request", detail: this.provider.model };
      const classification = await this.provider.classifyTurn(this.classificationInput(trimmed), { signal });
      const classifyUsage = this.provider.takeLastUsage();
      if (this.recordProviderUsage(runId, classifyUsage, "turn_classification")) {
        yield { type: "usage", usage: classifyUsage! };
      }
      this.state.appendEvent(runId, "provider_request_diagnostics", buildRequestDiagnostics({
        provider: this.provider.providerName,
        model: this.provider.model,
        kind: "classification",
        systemText: "classify user turn",
        userText: this.classificationInput(trimmed),
      }));
      this.state.appendEvent(runId, "turn_classified", classification);

      if (!classification.needs_local_tools) {
        yield* this.streamChatTurn(runId, trimmed, signal);
        this.state.updateRunStatus(runId, "succeeded", "chat turn completed");
        return;
      }

      const guard = this.tryBuildPreRunCacheGuard(runId, trimmed);
      if (guard) {
        yield { type: "status", phase: "cache_guard", text: "Checking cache guard", detail: guard.decision };
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
          yield { type: "assistant", text: withLatestRunDetails(message) };
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
      }, signal)
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
      this.rememberTurn(trimmed, final, runId);
      yield { type: "assistant", text: final };
    } catch (error) {
      if (isAbortError(error, signal)) {
        const reason = abortReasonText(signal.reason);
        const message = `Current run cancelled: ${reason}`;
        this.state.updateRunStatus(runId, "cancelled", message);
        this.state.appendEvent(runId, "turn_cancelled", { reason });
        yield { type: "error", text: message };
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.state.updateRunStatus(runId, "failed", message);
      this.state.appendEvent(runId, "turn_failed", { message });
      this.rememberTurn(trimmed, `Previous local run failed: ${message}`, runId);
      yield { type: "error", text: message };
    } finally {
      if (this.activeAbortController === abortController) {
        this.activeAbortController = undefined;
      }
    }
  }

  private async *streamChatTurn(
    runId: string,
    userMessage: string,
    signal?: AbortSignal,
  ): AsyncGenerator<QueryEvent, void, void> {
    const messages = this.buildChatMessages(userMessage);
    let assistant = "";
    yield { type: "status", phase: "chatting", text: "Streaming answer", detail: this.provider!.model };
    for await (const event of this.provider!.streamChat(messages, { signal })) {
      throwIfAborted(signal);
      if (event.type === "text_delta") {
        assistant += event.text;
        yield { type: "assistant_delta", text: event.text };
      } else if (event.type === "reasoning_delta") {
        yield { type: "reasoning_delta", text: event.text };
      } else {
        const usage = usageSnapshotFromEvent(event);
        if (this.recordProviderUsage(runId, usage, "chat_stream")) {
          yield { type: "usage", usage };
        }
      }
    }
    this.rememberTurn(userMessage, assistant, runId);
    this.state.appendEvent(runId, "chat_finished", { text_chars: assistant.length });
    yield { type: "assistant", text: assistant };
  }

  private recordProviderUsage(
    runId: string,
    usage: UsageSnapshot | undefined,
    source: string,
    onEvent?: (event: QueryEvent) => void,
  ): boolean {
    if (!usage || !hasUsageTokens(usage)) return false;
    this.state.recordUsage(runId, usage, source);
    recordUsageSnapshot(usage);
    onEvent?.({ type: "usage", usage });
    return true;
  }

  private async runActionLoop(
    runId: string,
    userMessage: string,
    onEvent?: (event: QueryEvent) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    throwIfAborted(signal);
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
      throwIfAborted(signal);
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
        { title: "available_skills", body: this.availableSkillsPrompt(), priority: "project" },
        { title: "runtime_permissions", body: this.runtimePermissionPrompt(), priority: "context" },
        ...this.conversationPromptBlocks(),
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
      onEvent?.({
        type: "status",
        phase: "planning",
        text: `Planning action batch ${attempt + 1}/${maxActionTurns}`,
        detail: `context ${promptPlan.approxTokens} tok`,
      });
      this.state.appendEvent(runId, "provider_request_diagnostics", buildRequestDiagnostics({
        provider: this.provider!.providerName,
        model: this.provider!.model,
        kind: "action_plan",
        systemText: stablePrompt.text,
        userText: promptPlan.userMessage,
        stablePrefixHash: stablePrompt.hash,
      }));
      let streamedPlanningReasoning = false;
      let envelope: ActionEnvelope;
      try {
        envelope = await this.provider!.planActions({
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
          signal,
        });
      } catch (error) {
        if (isAbortError(error, signal)) throw error;
        throwIfAborted(signal);
        const message = error instanceof Error ? error.message : String(error);
        const nonStreamReasoning = this.provider!.takeLastReasoning?.();
        if (!streamedPlanningReasoning && nonStreamReasoning) {
          onEvent?.({ type: "reasoning_delta", text: nonStreamReasoning });
        }
        const planUsage = this.provider!.takeLastUsage();
        this.recordProviderUsage(runId, planUsage, `action_plan_attempt_${attempt + 1}`, onEvent);
        this.state.appendEvent(runId, "action_plan_failed", {
          attempt: attempt + 1,
          message,
        });
        const failureFeedback = actionPlanFailureFeedback(message);
        if (attempt + 1 >= maxActionTurns) {
          this.state.updateRunStatus(runId, "failed", failureFeedback.final_message);
          return withLatestRunDetails(failureFeedback.final_message);
        }
        feedback = failureFeedback;
        finalMessage = failureFeedback.final_message;
        continue;
      }
      throwIfAborted(signal);
      const nonStreamReasoning = this.provider!.takeLastReasoning?.();
      if (!streamedPlanningReasoning && nonStreamReasoning) {
        onEvent?.({ type: "reasoning_delta", text: nonStreamReasoning });
      }
      const planUsage = this.provider!.takeLastUsage();
      this.recordProviderUsage(runId, planUsage, `action_plan_attempt_${attempt + 1}`, onEvent);
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
        onEvent?.({ type: "status", phase: "finishing", text: "Preparing final response", detail: envelope.task_kind });
        this.state.updateRunStatus(runId, "succeeded", envelope.final_message);
        return envelope.final_message || "已完成。";
      }

      const hookService = new HookService(this.config.projectPath, this.config.dataDir);
      const approvalPolicy = new ApprovalService(this.state).policy().manualToolApproval
        ? { state: this.state, runId, mode: "manual" as const }
        : undefined;
      const executionOptions: ExecutionOptions = {
        shellPolicy: { ...defaultShellPolicy, allowShell: this.permissions.allowShell },
        browserPolicy: { allowBrowser: this.permissions.allowBrowser },
        dataDir: this.config.dataDir,
        fileStateCache: this.fileStateCache,
        approvalPolicy,
        state: this.state,
        runId,
        skillRunner: async (skillInput) => {
          const result = await runSkillTask({
            name: skillInput.name,
            task: skillInput.task,
            config: this.config,
            provider: this.provider!,
            permissions: this.permissions,
            maxTurns: skillInput.maxTurns,
            state: this.state,
            runId,
            signal,
            onUsage: (usage, source) => {
              this.recordProviderUsage(runId, usage, source, onEvent);
            },
          });
          return {
            skill: {
              name: result.skill.name,
              scope: result.skill.scope,
              path: result.skill.path,
            },
            execution: result.execution,
            turnCount: result.turns.length,
          };
        },
        onToolEvent: async (event) => {
          const rendered = renderToolRunEvent(event);
          throwIfAborted(signal);
          if (rendered) onEvent?.(rendered);
          this.state.appendEvent(runId, `tool_${event.phase}`, {
            action: event.action,
            result: event.result,
            started_at_ms: event.startedAtMs,
            finished_at_ms: event.finishedAtMs,
            duration_ms: event.durationMs,
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
                status: "failed" as const,
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
        abortSignal: signal,
      };
      onEvent?.({
        type: "status",
        phase: "tool",
        text: `Running ${envelope.actions.length} tool action${envelope.actions.length === 1 ? "" : "s"}`,
        detail: summarizeActionTypes(envelope.actions),
      });
      let report = await executeEnvelope(this.config.projectPath, envelope, executionOptions);
      const validationEnvelope = this.autoValidationEnvelope(userMessage, report);
      if (validationEnvelope) {
        onEvent?.({
          type: "status",
          phase: "validating",
          text: "Validating generated artifacts",
          detail: summarizeActionTypes(validationEnvelope.actions),
        });
        const validationReport = await executeEnvelope(this.config.projectPath, validationEnvelope, executionOptions);
        report = mergeReports(report, validationReport);
      }
      throwIfAborted(signal);
      const compactReport = compactActionReport(report);
      this.persistToolResultSummary(runId, attempt + 1, compactReport);
      this.saveRunProgressCheckpoint(runId, attempt + 1, envelope, compactReport);
      this.state.recordActionResults(runId, report);
      finalMessage = envelope.final_message || report.final_message;
      let trajectoryNote: string | undefined;

      const enteredPlanMode = report.results.some((result) => result.action_type === "EnterPlanMode");
      const exitedPlanMode = report.results.some((result) => result.action_type === "ExitPlanMode");
      if (enteredPlanMode && !exitedPlanMode) {
        trajectory.push({ attempt: attempt + 1, assistantEnvelope: envelope, toolReport: compactReport, note: "Plan mode pauses execution." });
        const message = [
          "Entered plan mode; no implementation files were changed yet.",
          "For direct build requests, ask DeepSeekCode to create the first batch of files instead of entering plan mode.",
          "Details are available in the latest run trace.",
        ].join("\n");
        this.state.updateRunStatus(runId, "paused", message);
        return message;
      }

      const userDecisionResult = report.results.find(resultRequiresUserDecision);
      if (userDecisionResult) {
        const message = userVisibleDecisionMessage(userDecisionResult.message ?? "User decision required before continuing.");
        trajectory.push({ attempt: attempt + 1, assistantEnvelope: envelope, toolReport: compactReport, note: "User decision gate pauses execution." });
        const pendingGate = this.latestPendingGateForRun(runId);
        if (this.awaitUserDecisions && pendingGate) {
          this.state.updateRunStatus(runId, "paused", message);
          this.state.appendEvent(runId, "user_decision_wait_started", {
            gate_id: pendingGate.id,
            subject_type: pendingGate.subjectType,
          });
          onEvent?.({
            type: "status",
            phase: "waiting_user",
            text: "Waiting for user decision",
            detail: pendingGate.subjectType,
          });
          const decidedGate = await this.waitForGateDecision(pendingGate.id, signal);
          this.state.appendEvent(runId, "user_decision_received", {
            gate_id: pendingGate.id,
            status: decidedGate?.status ?? "missing",
            subject_type: decidedGate?.subjectType ?? pendingGate.subjectType,
          });
          if (decidedGate?.status === "approved") {
            this.state.updateRunStatus(runId, "running", "user decision approved");
            feedback = userDecisionFeedback(compactReport, decidedGate);
            continue;
          }
          const status = decidedGate?.status ?? "cancelled";
          const finalDecisionMessage = `User ${status} the pending ${pendingGate.subjectType} request.`;
          this.state.updateRunStatus(runId, status === "cancelled" ? "cancelled" : "failed", finalDecisionMessage);
          return withLatestRunDetails(finalDecisionMessage);
        }
        this.state.updateRunStatus(runId, "paused", message);
        return withLatestRunDetails(message);
      }

      if (report.status === "succeeded") {
        const changedSomething = hasImplementationProgress(report);
        if (!envelope.continue_work && expectsImplementation(envelope) && !changedSomething) {
          const message = "The model claimed a file-change task was complete without changing or validating any files.";
          trajectoryNote = message;
          trajectory.push({ attempt: attempt + 1, assistantEnvelope: envelope, toolReport: compactReport, note: trajectoryNote });
          this.state.appendEvent(runId, "action_feedback_no_progress", {
            attempt: attempt + 1,
            task_kind: envelope.task_kind,
            acceptance_criteria: envelope.acceptance_criteria,
            message,
          });
          if (attempt + 1 >= maxActionTurns) {
            this.state.updateRunStatus(runId, "failed", message);
            return withLatestRunDetails(message);
          }
          feedback = {
            final_message: [
              message,
              "Continue like ClaudeCode after tool_result feedback: issue the next useful file/tool action, or truthfully explain why the request cannot be completed.",
            ].join("\n"),
            status: "failed",
            results: compactReport.results,
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
            toolReport: compactReport,
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
              compactReport.final_message,
              `Continue with the next compact batch: ${remainingWork}`,
              changedSomething
                ? ""
                : "Continue like ClaudeCode after tool_result feedback: the last batch only inspected or updated planning state. The next response must use write_file, apply_patch, validate_artifact, or set continue_work=false if the runnable result is complete.",
            ].filter(Boolean).join("\n"),
            status: report.status,
            results: compactReport.results,
          };
          finalMessage = remainingWork;
          continue;
        }
        trajectory.push({ attempt: attempt + 1, assistantEnvelope: envelope, toolReport: compactReport, note: trajectoryNote });
        this.state.updateRunStatus(runId, "succeeded", finalMessage);
        return summarizeReport(
          finalMessage,
          runId,
          this.state.getRun(runId)?.actionCount ?? report.results.length,
          report,
        );
      }

      trajectory.push({ attempt: attempt + 1, assistantEnvelope: envelope, toolReport: compactReport, note: "Tool report failed; retry with feedback." });
      feedback = compactReport;
    }

    this.state.updateRunStatus(runId, "failed", finalMessage || "action loop failed");
    return withLatestRunDetails("执行失败。");
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

  private rememberTurn(userMessage: string, assistantMessage: string, runId?: string): void {
    this.history.push({ role: "user", content: userMessage });
    this.history.push({ role: "assistant", content: assistantMessage });
    this.persistChatTurn(userMessage, assistantMessage, runId);
    this.updateRollingSummary();
  }

  private ensureSessionContext(runId?: string): void {
    if (this.sessionPersistence === "off") return;
    let sessionId = getCurrentSessionId(this.state, this.config.projectPath);
    if (!sessionId && this.sessionPersistence === "managed") {
      sessionId = new SessionStorage(this.config.dataDir).sessionId;
      setCurrentSessionId(this.state, this.config.projectPath, sessionId);
    }
    if (!sessionId || sessionId === this.loadedSessionId) return;
    const records = new SessionStorage(this.config.dataDir, sessionId).readAll(1000);
    const built = buildSessionContext(records);
    this.history.splice(0, this.history.length, ...built.history);
    this.rollingSummary.reset(built.summary);
    this.loadedSessionId = sessionId;
    this.state.appendEvent(runId ?? null, "session_context_loaded", {
      session_id: sessionId,
      total_records: built.totalRecords,
      selected_records: built.selectedRecords.length,
      tail_messages: built.history.length,
      summary_chars: built.summary.length,
      mode: this.sessionPersistence,
    });
  }

  private currentSessionStorage(): SessionStorage | undefined {
    if (this.sessionPersistence === "off") return undefined;
    let sessionId = getCurrentSessionId(this.state, this.config.projectPath);
    if (!sessionId && this.sessionPersistence === "managed") {
      sessionId = new SessionStorage(this.config.dataDir).sessionId;
      setCurrentSessionId(this.state, this.config.projectPath, sessionId);
    }
    return sessionId ? new SessionStorage(this.config.dataDir, sessionId) : undefined;
  }

  private persistChatTurn(userMessage: string, assistantMessage: string, runId?: string): void {
    if (this.sessionPersistence !== "managed") return;
    const storage = this.currentSessionStorage();
    if (!storage) return;
    storage.append({ role: "user", text: userMessage, runId });
    storage.append({ role: "assistant", text: assistantMessage, runId });
  }

  private persistToolResultSummary(
    runId: string,
    attempt: number,
    report: ActionExecutionReport,
    note?: string,
  ): void {
    if (this.sessionPersistence === "off") return;
    const storage = this.currentSessionStorage();
    if (!storage) return;
    const text = formatToolResultSummary(report, { runId, attempt, note });
    storage.append({ role: "tool", text, runId });
    this.state.appendEvent(runId, "tool_result_summary_persisted", {
      session_id: storage.sessionId,
      attempt,
      chars: text.length,
      result_count: report.results.length,
      status: report.status,
    });
  }

  private classificationInput(userMessage: string): string {
    const context = this.conversationPromptBlocks();
    if (context.length === 0) return userMessage;
    return [
      ...context.map((block) => `<${block.title}>\n${block.body}\n</${block.title}>`),
      `<current_user_request>\n${userMessage}\n</current_user_request>`,
    ].join("\n\n");
  }

  private conversationPromptBlocks(): Array<{ title: string; body: string; priority: "context" }> {
    const blocks: Array<{ title: string; body: string; priority: "context" }> = [];
    if (this.rollingSummary.text.trim()) {
      blocks.push({
        title: "conversation_summary",
        body: this.rollingSummary.text,
        priority: "context",
      });
    }
    const runState = buildRunStateContext(this.state, this.config.projectPath);
    if (runState.trim()) {
      blocks.push({
        title: "runtime_run_state",
        body: runState,
        priority: "context",
      });
    }
    const recent = this.history.slice(-8);
    if (recent.length > 0) {
      blocks.push({
        title: "recent_conversation",
        body: recent.map((message, index) =>
          `${index + 1}. ${message.role}: ${compact(message.content.replace(/\s+/g, " ").trim(), 1200)}`,
        ).join("\n"),
        priority: "context",
      });
    }
    return blocks;
  }

  private saveRunProgressCheckpoint(
    runId: string,
    attempt: number,
    envelope: ActionEnvelope,
    report: ActionExecutionReport,
  ): void {
    const snapshot = {
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
    this.state.saveCheckpoint(runId, `run_progress_attempt_${attempt}`, snapshot);
    this.state.appendEvent(runId, "run_progress_checkpoint", {
      attempt,
      task_kind: envelope.task_kind,
      action_count: envelope.actions.length,
      status: report.status,
      result_count: report.results.length,
      continue_work: envelope.continue_work ?? false,
      remaining_work: envelope.remaining_work ?? "",
    });
  }

  private autoValidationEnvelope(
    userMessage: string,
    report: ActionExecutionReport,
  ): ActionEnvelope | undefined {
    if (report.status !== "succeeded" || !asksForArtifactValidation(userMessage)) return undefined;
    const alreadyValidated = new Set(
      report.results
        .filter((result) => result.action_type === "validate_artifact" && result.path)
        .map((result) => normalizeProjectRelativePath(this.config.projectPath, result.path!)),
    );
    const targets = report.results
      .filter((result) => result.status === "succeeded" && result.path && result.action_type !== "validate_artifact")
      .filter((result) => result.artifact_kind && shouldValidateArtifactKind(result.artifact_kind))
      .map((result) => ({
        path: normalizeProjectRelativePath(this.config.projectPath, result.path!),
        expected_kind: result.artifact_kind!,
      }))
      .filter((target, index, all) =>
        !alreadyValidated.has(target.path) &&
        all.findIndex((candidate) => candidate.path === target.path) === index)
      .slice(0, 6);
    if (targets.length === 0) return undefined;
    return {
      task_kind: "validation",
      needs_local_tools: true,
      acceptance_criteria: targets.map((target) => `${target.path} validates as ${target.expected_kind}`),
      final_message: "Runtime artifact validation completed.",
      actions: targets.map((target) => ({
        type: "validate_artifact" as const,
        path: target.path,
        expected_kind: target.expected_kind,
      })),
    };
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
      { title: "available_skills", body: this.availableSkillsPrompt(), priority: "project" },
      { title: "runtime_permissions", body: this.runtimePermissionPrompt(), priority: "context" },
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

  private runtimePermissionPrompt(): string {
    return [
      `profile=${this.permissions.profile ?? this.config.permissionProfile}`,
      `shell=${this.permissions.allowShell ? "enabled" : "disabled"}`,
      `browser=${this.permissions.allowBrowser ? "enabled" : "disabled"}`,
      "When shell=disabled, do not plan run_command, ssh_run, or mcp_call actions that require shell.",
      "Prefer write_file/apply_patch/validate_artifact for local file work that does not require a process.",
    ].join("\n");
  }

  private latestPendingGateForRun(runId: string): ApprovalGateRecord | undefined {
    return this.state.listApprovalGates({ runId, status: "pending" }, 20)[0];
  }

  private async waitForGateDecision(
    gateId: string,
    signal?: AbortSignal,
  ): Promise<ApprovalGateRecord | undefined> {
    while (true) {
      throwIfAborted(signal);
      const gate = this.state.listApprovalGates({}, 100).find((candidate) => candidate.id === gateId);
      if (!gate || gate.status !== "pending") return gate;
      await sleep(150, signal);
    }
  }

  private availableSkillsPrompt(): string {
    const skills = discoverSkills(this.config.projectPath, this.config.dataDir);
    if (skills.length === 0) return "(none)";
    return skills
      .slice(0, 40)
      .map((skill) => `- ${skill.name} (${skill.scope}): ${skill.description || "(no description)"}`)
      .join("\n");
  }
}

function summarizeReport(
  finalMessage: string,
  runId: string,
  actionCount: number,
  report?: ActionExecutionReport,
): string {
  const prefix = completionMessage(finalMessage, report);
  void runId;
  return `${prefix}\nactions=${actionCount}`;
}

function completionMessage(finalMessage: string, report?: ActionExecutionReport): string {
  const text = finalMessage.trim();
  if (!report || report.status !== "succeeded") return text || "已完成。";
  if (text && !looksOngoingClean(text)) return text;
  const changed = uniquePaths(report.results
    .filter((result) => ["write_file", "apply_patch", "create_docx", "create_pptx"].includes(result.action_type))
    .map((result) => result.path)
    .filter((value): value is string => Boolean(value)));
  const validated = uniquePaths(report.results
    .filter((result) => result.action_type === "validate_artifact" && result.status === "succeeded")
    .map((result) => result.path)
    .filter((value): value is string => Boolean(value)));
  return [
    "已完成请求。",
    changed.length ? `产物：${changed.slice(0, 6).join(", ")}` : "",
    validated.length ? `验证通过：${validated.slice(0, 6).join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

/*
function legacyMojibakeCompletionMessage(finalMessage: string, report?: ActionExecutionReport): string {
  const text = finalMessage.trim();
  if (!report || report.status !== "succeeded") return text || "已完成。";
  if (text && !looksOngoing(text)) return text;
  const changed = uniquePaths(report.results
    .filter((result) => ["write_file", "apply_patch", "create_docx", "create_pptx"].includes(result.action_type))
    .map((result) => result.path)
    .filter((value): value is string => Boolean(value)));
  const validated = uniquePaths(report.results
    .filter((result) => result.action_type === "validate_artifact" && result.status === "succeeded")
    .map((result) => result.path)
    .filter((value): value is string => Boolean(value)));
  return [
    "已完成请求。",
    changed.length ? `产物：${changed.slice(0, 6).join(", ")}` : "",
    validated.length ? `验证通过：${validated.slice(0, 6).join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

function looksOngoing(text: string): boolean {
  return /正在|准备|将要|接下来|需要继续|尝试|验证中|creating|validating|will\s+/i.test(text);
}

*/
function looksOngoingClean(text: string): boolean {
  return /正在|准备|将要|接下来|需要继续|尝试|验证中|creating|validating|will\s+/i.test(text);
}

function withLatestRunDetails(message: string): string {
  return `${message}\nDetails are available in the latest run trace.`;
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((item) => item.replace(/\\/g, "/")))];
}

function hasUsageTokens(usage: UsageSnapshot): boolean {
  return [
    usage.inputTokens,
    usage.outputTokens,
    usage.cacheHitTokens,
    usage.cacheMissTokens,
  ].some((value) => typeof value === "number" && value > 0);
}

function usageSnapshotFromEvent(event: UsageSnapshot): UsageSnapshot {
  return {
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    cacheHitTokens: event.cacheHitTokens,
    cacheMissTokens: event.cacheMissTokens,
  };
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

function resultRequiresUserDecision(result: ActionResult): boolean {
  return resultRequiresApproval(result)
    || Boolean(result.message?.startsWith("Question awaiting user answer."));
}

function actionPlanFailureFeedback(message: string): ActionExecutionReport {
  return {
    status: "failed",
    final_message: [
      `Provider action plan failed before tool execution: ${message}`,
      "Continue like ClaudeCode after tool_result feedback: retry with a smaller valid ActionEnvelope JSON object instead of ending the task.",
      "Use content_lines for multiline files, keep the next batch compact, and set continue_work=true when more files remain.",
    ].join("\n"),
    results: [{
      action_type: "action_plan",
      status: "failed",
      message,
    }],
  };
}

function userVisibleDecisionMessage(message: string): string {
  if (!message.startsWith("Question awaiting user answer.")) return message;
  const lines = message
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => !/^Question awaiting user answer\./i.test(line.trim()))
    .filter((line) => !/^pending question$/i.test(line.trim()));
  return lines.join("\n").trim() || "Waiting for your answer in the permission panel.";
}

function userDecisionFeedback(
  report: ActionExecutionReport,
  gate: ApprovalGateRecord,
): ActionExecutionReport {
  const answer = gate.subjectType === "question" && gate.rationale.trim()
    ? `User answer: ${gate.rationale.trim()}`
    : "";
  return {
    status: "failed",
    final_message: [
      `User approved the pending ${gate.subjectType} request.`,
      answer,
      "Continue from the blocked tool_result. Retry the approved local action if it was a tool approval, or use the user answer if it was a question.",
    ].filter(Boolean).join("\n"),
    results: report.results,
  };
}

function asksForArtifactValidation(userMessage: string): boolean {
  return /验证|验收|确认|检查|validate|verify|artifact|产物|Office|PPTX?|DOCX?|PDF|HTML|Markdown/i.test(userMessage);
}

function shouldValidateArtifactKind(kind: string): boolean {
  return ["markdown", "html", "docx", "pptx", "pdf", "image", "screenshot"].includes(kind);
}

function normalizeProjectRelativePath(projectPath: string, target: string): string {
  const relative = path.isAbsolute(target) ? path.relative(projectPath, target) : target;
  return relative.split(path.sep).join("/");
}

function mergeReports(
  primary: ActionExecutionReport,
  secondary: ActionExecutionReport,
): ActionExecutionReport {
  return {
    final_message: primary.final_message,
    status: primary.status === "succeeded" && secondary.status === "succeeded" ? "succeeded" : "failed",
    results: [...primary.results, ...secondary.results],
  };
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

function summarizeActionTypes(actions: ActionEnvelope["actions"]): string {
  const counts = new Map<string, number>();
  for (const action of actions) {
    const type = (action as { type?: string }).type ?? "action";
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => count > 1 ? `${type} x${count}` : type)
    .slice(0, 4)
    .join(", ");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function renderToolRunEvent(event: ToolRunEvent): QueryEvent | null {
  if (event.phase === "start") {
    return {
      type: "tool_start",
      text: `${event.action.type} started${actionTarget(event.action)}`,
    };
  }
  if (!event.result) return null;
  const duration = event.durationMs === undefined ? "" : ` (${formatDuration(event.durationMs)})`;
  return {
    type: "tool_result",
    text: [
      `${event.result.action_type} ${event.result.status}${event.result.path ? ` ${event.result.path}` : actionTarget(event.action)}${duration}`,
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

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 10_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.round(ms / 1_000)}s`;
}
