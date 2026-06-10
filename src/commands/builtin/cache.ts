import React from "react";
import type { Command, CommandContext } from "../../types/command.js";
import { CacheDoctorPanel, buildCacheDoctorPanelModel } from "../../components/CacheDoctorPanel.js";
import { CacheGuardPanel, buildCacheGuardPanelModel } from "../../components/CacheGuardPanel.js";
import { CachePlanPanel, buildCachePlanPanelModel } from "../../components/CachePlanPanel.js";
import { CachePreflightPanel, buildCachePreflightPanelModel } from "../../components/CachePreflightPanel.js";
import { CachePreparePanel, buildCachePreparePanelModel } from "../../components/CachePreparePanel.js";
import { CacheProfilePanel, buildCacheProfilePanelModel } from "../../components/CacheProfilePanel.js";
import { CacheReadinessPanel, buildCacheReadinessPanelModel } from "../../components/CacheReadinessPanel.js";
import {
  CachePinPanel,
  buildCachePinApplyPanelModel,
  buildCachePinAuditPanelModel,
  buildCachePinSuggestPanelModel,
} from "../../components/CachePinPanel.js";
import { CacheShapePanel, buildCacheShapePanelModel } from "../../components/CacheShapePanel.js";
import { summarizeCacheTelemetry } from "../../services/cache/telemetry.js";
import { buildContextBundle, contextBundlePrompt } from "../../context/contextBundle.js";
import { readProjectMemory } from "../../memdir/projectMemory.js";
import { buildResonixPromptPlan, cachePlanSummary } from "../../services/cache/resonixPolicy.js";
import { buildCacheStabilityReport, formatCacheStabilityReport } from "../../services/cache/cacheStability.js";
import {
  CacheShapeHistoryService,
  formatCacheShapeHistory,
  formatCacheShapeObservation,
} from "../../services/cache/cacheShapeHistory.js";
import { buildCacheDoctorReport, formatCacheDoctorReport } from "../../services/cache/cacheDoctor.js";
import { buildCacheGuardReport, formatCacheGuardReport } from "../../services/cache/cacheGuard.js";
import { CacheGuardPolicyService, formatCacheGuardPolicy } from "../../services/cache/cacheGuardPolicy.js";
import { CachePinService } from "../../services/cache/cachePins.js";
import { auditCachePins, formatCachePinAudit } from "../../services/cache/cachePinAudit.js";
import {
  CacheProfileService,
  auditCacheProfiles,
  buildCacheProfileCleanupPlan,
  buildCacheProfileForecast,
  formatCacheProfileAudit,
  formatCacheProfileCleanup,
  formatCacheProfileForecast,
  formatCacheProfile,
  formatCacheProfileList,
  formatCacheProfileMatches,
  matchCacheProfiles,
} from "../../services/cache/cacheProfiles.js";
import { buildCachePreflightReport, formatCachePreflightReport } from "../../services/cache/cachePreflight.js";
import { buildCacheReadinessReport, formatCacheReadinessReport } from "../../services/cache/cacheReadiness.js";
import {
  applyCachePinSuggestions,
  createCachePinFromSource,
  formatCachePinApplyResult,
  formatCachePinSuggestions,
  suggestCachePins,
} from "../../services/cache/cachePinSuggestions.js";
import { InferenceSettingsService } from "../../services/inference/inferenceSettingsService.js";
import { resolveRunId } from "../runSelection.js";

export const cacheCommand: Command = {
  name: "cache",
  description: "Show DeepSeek cache telemetry.",
  usage: "[report|trend|guard <goal>|guard policy|guard strict on|off|guard min-hit <percent>|guard reset|guard path|prepare <goal>|preflight <goal>|plan <goal>|profile list|profile audit|profile clean [--apply]|profile forecast <goal>|profile match <goal>|profile auto <goal>|profile save <name> <goal>|profile prepare <name>|profile show <name>|profile remove <name>|profile path [name]|shapes [limit]|shapes clear|doctor [run-id|attached|current]|pin list|pin audit|pin apply [goal]|pin suggest [goal]|pin from <file> [name]|pin add <name> <content>|pin show <name>|pin remove <name>|pin path [name]]",
  execute(args, context) {
    const trimmed = args.trim();
    if (trimmed === "report") {
      const runs = context.state.listRuns(50);
      const telemetry = summarizeCacheTelemetry(runs);
      const pinAudit = auditCachePins(context.config.projectPath);
      const shapes = new CacheShapeHistoryService(context.config.projectPath).list(20);
      const readiness = buildCacheReadinessReport({ telemetry, pinAudit, shapes });
      return {
        message: formatCacheReport(readiness),
        display: React.createElement(CacheReadinessPanel, { model: buildCacheReadinessPanelModel(readiness) }),
      };
    }
    if (trimmed === "trend") {
      return { message: formatCacheTrend(context) };
    }
    if (trimmed === "profile" || trimmed.startsWith("profile ")) {
      return handleCacheProfile(trimmed.slice("profile".length).trim(), context);
    }
    if (trimmed === "pin" || trimmed.startsWith("pin ")) {
      const pinArgs = trimmed.slice("pin".length).trim();
      if (pinArgs === "audit") {
        const report = auditCachePins(context.config.projectPath);
        return {
          message: formatCachePinAudit(report),
          display: React.createElement(CachePinPanel, { model: buildCachePinAuditPanelModel(report) }),
        };
      }
      if (pinArgs === "apply" || pinArgs.startsWith("apply ")) {
        const goal = pinArgs.startsWith("apply ") ? pinArgs.slice("apply ".length).trim() : "";
        const result = applyCachePinSuggestions(context.config.projectPath, { goal, limit: 4 });
        return {
          message: formatCachePinApplyResult(result),
          display: React.createElement(CachePinPanel, { model: buildCachePinApplyPanelModel(result) }),
        };
      }
      if (pinArgs === "suggest" || pinArgs.startsWith("suggest ")) {
        const goal = pinArgs.startsWith("suggest ") ? pinArgs.slice("suggest ".length).trim() : "";
        const suggestions = suggestCachePins(context.config.projectPath, { goal, limit: 6 });
        return {
          message: formatCachePinSuggestions(suggestions),
          display: React.createElement(CachePinPanel, { model: buildCachePinSuggestPanelModel({ suggestions, goal }) }),
        };
      }
      return { message: handleCachePin(pinArgs, context.config.projectPath) };
    }
    if (trimmed === "shapes" || trimmed.startsWith("shapes ")) {
      const shapeArgs = trimmed.slice("shapes".length).trim();
      if (shapeArgs !== "clear" && shapeArgs !== "path") {
        const limit = shapeArgs ? Number.parseInt(shapeArgs, 10) : 10;
        if (!shapeArgs || (Number.isFinite(limit) && limit > 0)) {
          const records = new CacheShapeHistoryService(context.config.projectPath).list(limit || 10);
          return {
            message: formatCacheShapeHistory(records),
            display: React.createElement(CacheShapePanel, { model: buildCacheShapePanelModel(records) }),
          };
        }
      }
      return { message: handleCacheShapes(shapeArgs, context.config.projectPath) };
    }
    if (trimmed === "guard" || trimmed === "guard policy") {
      const policy = new CacheGuardPolicyService(context.config.projectPath).current();
      return { message: formatCacheGuardPolicy(policy) };
    }
    if (trimmed === "guard path") {
      return { message: new CacheGuardPolicyService(context.config.projectPath).path() };
    }
    if (trimmed === "guard reset") {
      const policy = new CacheGuardPolicyService(context.config.projectPath).reset();
      return { message: formatCacheGuardPolicy(policy) };
    }
    if (trimmed === "guard strict on" || trimmed === "guard strict off") {
      const strict = trimmed.endsWith(" on");
      const policy = new CacheGuardPolicyService(context.config.projectPath).setStrict(strict);
      return { message: formatCacheGuardPolicy(policy) };
    }
    if (trimmed.startsWith("guard min-hit ")) {
      try {
        const policy = new CacheGuardPolicyService(context.config.projectPath).setMinHitRate(
          trimmed.slice("guard min-hit ".length).trim(),
        );
        return { message: formatCacheGuardPolicy(policy) };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("guard ")) {
      const goal = trimmed.slice("guard ".length).trim();
      if (!goal) return { message: "Usage: /cache guard <goal>" };
      const preflight = buildGoalPreflight(context, goal);
      const profiles = new CacheProfileService(context.config.projectPath).list();
      const matches = matchCacheProfiles(profiles, goal, 3);
      const forecast = buildCacheProfileForecast({ goal, preflight, matches });
      const policy = new CacheGuardPolicyService(context.config.projectPath).current();
      const guard = buildCacheGuardReport({ preflight, forecast, minHitRate: policy.minHitRate });
      return {
        message: [formatCacheGuardReport(guard), "", formatCacheGuardPolicy(policy)].join("\n"),
        display: React.createElement(CacheGuardPanel, { model: buildCacheGuardPanelModel(guard) }),
      };
    }
    if (trimmed.startsWith("prepare ")) {
      const goal = trimmed.slice("prepare ".length).trim();
      if (!goal) return { message: "Usage: /cache prepare <goal>" };
      const applied = applyCachePinSuggestions(context.config.projectPath, { goal, limit: 4 });
      const preflight = buildGoalPreflight(context, goal);
      return {
        message: [
          "DeepSeek cache prepare",
          formatCachePinApplyResult(applied),
          "",
          formatCachePreflightReport(preflight),
        ].join("\n"),
        display: React.createElement(CachePreparePanel, { model: buildCachePreparePanelModel({ applied, preflight }) }),
      };
    }
    if (trimmed.startsWith("preflight ")) {
      const goal = trimmed.slice("preflight ".length).trim();
      if (!goal) return { message: "Usage: /cache preflight <goal>" };
      const preflight = buildGoalPreflight(context, goal);
      return {
        message: formatCachePreflightReport(preflight),
        display: React.createElement(CachePreflightPanel, { model: buildCachePreflightPanelModel(preflight) }),
      };
    }
    if (trimmed.startsWith("plan ")) {
      const goal = trimmed.slice("plan ".length).trim();
      if (!goal) return { message: "Usage: /cache plan <goal>" };
      const planned = buildGoalCachePlan(context, goal);
      return {
        message: [
          `effort=${planned.inference.effort}`,
          cachePlanSummary(planned.plan),
          formatCacheStabilityReport(planned.stability),
          formatCacheShapeObservation(planned.shapeObservation),
          planned.stability.recommendation,
          ...planned.plan.blocks.map((block) =>
            `${block.priority}:${block.title} chars=${block.chars}${block.truncated ? " truncated" : ""}`,
          ),
        ].join("\n"),
        display: React.createElement(CachePlanPanel, {
          model: buildCachePlanPanelModel({
            goal,
            effort: planned.inference.effort,
            plan: planned.plan,
            maxDynamicChars: planned.inference.actionDynamicChars,
            shapeNote: formatCacheShapeObservation(planned.shapeObservation),
          }),
        }),
      };
    }
    if (trimmed === "doctor" || trimmed.startsWith("doctor ")) {
      const selector = trimmed.startsWith("doctor ") ? trimmed.slice("doctor ".length).trim() : "";
      const runId = selector ? resolveRunId(selector, context) : undefined;
      if (selector && !runId) return { message: `Run not found: ${selector}` };
      const report = buildCacheDoctorReport(context.state, runId);
      return {
        message: formatCacheDoctorReport(report),
        display: React.createElement(CacheDoctorPanel, { model: buildCacheDoctorPanelModel(report) }),
      };
    }
    const runs = context.state.listRuns(20);
    const summary = summarizeCacheTelemetry(runs);
    const pinAudit = auditCachePins(context.config.projectPath);
    const shapes = new CacheShapeHistoryService(context.config.projectPath).list(10);
    const readiness = buildCacheReadinessReport({ telemetry: summary, pinAudit, shapes });
    return {
      message: formatCacheReadinessReport(readiness),
      display: React.createElement(CacheReadinessPanel, { model: buildCacheReadinessPanelModel(readiness) }),
    };
  },
};

function buildGoalPreflight(context: CommandContext, goal: string) {
  const planned = buildGoalCachePlan(context, goal);
  const telemetry = summarizeCacheTelemetry(context.state.listRuns(20));
  const pinAudit = auditCachePins(context.config.projectPath);
  const shapes = new CacheShapeHistoryService(context.config.projectPath).list(10);
  const readiness = buildCacheReadinessReport({ telemetry, pinAudit, shapes });
  const suggestions = suggestCachePins(context.config.projectPath, { goal, limit: 4 });
  return buildCachePreflightReport({
    goal,
    effort: planned.inference.effort,
    plan: planned.plan,
    stability: planned.stability,
    shapeObservation: planned.shapeObservation,
    readiness,
    pinAudit,
    suggestions,
  });
}

function buildGoalCachePlan(context: CommandContext, goal: string) {
  const inference = new InferenceSettingsService(context.config.projectPath).effective();
  const bundle = buildContextBundle(context.config.projectPath, inference.actionContextChars, goal);
  const pins = new CachePinService(context.config.projectPath).promptBlocks();
  const plan = buildResonixPromptPlan([
    ...pins,
    { title: "project_memory", body: readProjectMemory(context.config.projectPath) || "(empty)", priority: "project" },
    {
      title: "project_repository_map",
      body: bundle.repositoryMap.files.map((file) => `${file.path} (${file.size} bytes)`).join("\n"),
      priority: "project",
    },
    { title: "selected_context", body: contextBundlePrompt(bundle), priority: "context" },
    { title: "current_user_request", body: goal, priority: "request" },
  ], { maxDynamicChars: inference.actionDynamicChars });
  const stability = buildCacheStabilityReport(plan);
  const shapeObservation = new CacheShapeHistoryService(context.config.projectPath).record(stability);
  return { inference, plan, stability, shapeObservation };
}

function formatCacheReport(report: ReturnType<typeof buildCacheReadinessReport>): string {
  const totalCacheTokens = report.telemetry.hitTokens + report.telemetry.missTokens;
  const hitRate = totalCacheTokens > 0
    ? Math.round((report.telemetry.hitTokens / totalCacheTokens) * 100)
    : 0;
  const stableSignal = report.pinCount > 0 ? `${report.pinCount} pins / ${report.totalPinChars} chars` : "no stable pins";
  const shapeSignal = report.totalShapes > 0
    ? `${report.repeatedShapes}/${report.totalShapes} repeated shapes, ${report.riskyShapes} risky`
    : "no recorded prompt shapes";
  const diagnosis = [
    totalCacheTokens === 0 ? "No provider cache telemetry has been recorded yet." : "",
    hitRate < 35 && totalCacheTokens > 0 ? "Cache hit rate is cold; dynamic context is likely shifting before reusable blocks." : "",
    report.pinCount === 0 ? "Stable project facts are not pinned, so reusable prefix blocks are thin." : "",
    report.repeatedShapes === 0 && report.totalShapes > 0 ? "Recent prompt shapes are not repeating; similar tasks are not reusing the same prefix layout." : "",
    report.riskyShapes > 0 ? "Some recorded prompt shapes have medium/high churn risk." : "",
  ].filter(Boolean);
  return [
    "DeepSeek cache report",
    `status: ${report.status} score=${report.score}`,
    `provider telemetry: hit=${report.telemetry.hitTokens} miss=${report.telemetry.missTokens} rate=${report.telemetry.rate} observed_runs=${report.telemetry.observedRuns}`,
    `stable prefix: ${stableSignal}`,
    `prompt shapes: ${shapeSignal}`,
    "likely causes:",
    ...(diagnosis.length ? diagnosis.map((item) => `- ${item}`) : ["- Cache layout looks healthy for the recent runs."]),
    "actions:",
    ...report.recommendations.map((item) => `- ${item}`),
  ].join("\n");
}

function handleCacheProfile(args: string, context: CommandContext) {
  const service = new CacheProfileService(context.config.projectPath);
  if (!args || args === "list") {
    const profiles = service.list();
    return {
      message: formatCacheProfileList(profiles),
      display: React.createElement(CacheProfilePanel, {
        model: buildCacheProfilePanelModel({ profiles }),
      }),
    };
  }
  if (args === "audit") {
    const profiles = service.list();
    const audit = auditCacheProfiles(profiles);
    return {
      message: formatCacheProfileAudit(audit),
      display: React.createElement(CacheProfilePanel, {
        model: buildCacheProfilePanelModel({ profiles, audit, action: "audit" }),
      }),
    };
  }
  if (args === "clean" || args === "clean --apply") {
    const apply = args === "clean --apply";
    const profiles = service.list();
    const audit = auditCacheProfiles(profiles);
    const preview = buildCacheProfileCleanupPlan(audit, { apply });
    const removed = apply
      ? preview.candidates.filter((candidate) => service.remove(candidate.profile)).map((candidate) => candidate.profile)
      : [];
    const cleanup = buildCacheProfileCleanupPlan(audit, { apply, removed });
    return {
      message: formatCacheProfileCleanup(cleanup),
      display: React.createElement(CacheProfilePanel, {
        model: buildCacheProfilePanelModel({ profiles: service.list(), cleanup, action: "clean" }),
      }),
    };
  }
  if (args.startsWith("save ")) {
    const [name, goal] = splitFirstToken(args.slice("save ".length));
    if (!name || !goal) return { message: "Usage: /cache profile save <name> <goal>" };
    try {
      const preflight = buildGoalPreflight(context, goal);
      const profile = service.saveFromPreflight({
        name,
        preflight,
        pinNames: new CachePinService(context.config.projectPath).list().map((pin) => pin.name),
      });
      const profiles = service.list();
      return {
        message: [`cache profile ${profile.name} saved`, formatCacheProfile(profile)].join("\n"),
        display: React.createElement(CacheProfilePanel, {
          model: buildCacheProfilePanelModel({ profiles, selected: profile, action: "saved" }),
        }),
      };
    } catch (error) {
      return { message: error instanceof Error ? error.message : String(error) };
    }
  }
  if (args.startsWith("match ")) {
    const goal = args.slice("match ".length).trim();
    if (!goal) return { message: "Usage: /cache profile match <goal>" };
    const profiles = service.list();
    const matches = matchCacheProfiles(profiles, goal, 6);
    return {
      message: formatCacheProfileMatches(goal, matches),
      display: React.createElement(CacheProfilePanel, {
        model: buildCacheProfilePanelModel({ profiles, matches, queryGoal: goal, action: "match" }),
      }),
    };
  }
  if (args.startsWith("forecast ")) {
    const goal = args.slice("forecast ".length).trim();
    if (!goal) return { message: "Usage: /cache profile forecast <goal>" };
    const profiles = service.list();
    const matches = matchCacheProfiles(profiles, goal, 3);
    const preflight = buildGoalPreflight(context, goal);
    const forecast = buildCacheProfileForecast({ goal, preflight, matches });
    return {
      message: formatCacheProfileForecast(forecast),
      display: React.createElement(CacheProfilePanel, {
        model: buildCacheProfilePanelModel({ profiles, matches, forecast, queryGoal: goal, action: "forecast" }),
      }),
    };
  }
  if (args.startsWith("auto ")) {
    const goal = args.slice("auto ".length).trim();
    if (!goal) return { message: "Usage: /cache profile auto <goal>" };
    const matches = matchCacheProfiles(service.list(), goal, 1);
    const profileMatch = matches[0];
    const applied = applyCachePinSuggestions(context.config.projectPath, { goal, limit: 4 });
    const preflight = buildGoalPreflight(context, goal);
    return {
      message: [
        "DeepSeek cache profile auto",
        profileMatch
          ? `matched profile=${profileMatch.profile.name} score=${profileMatch.score} reason=${profileMatch.reason}`
          : "matched profile=none; falling back to direct cache prepare",
        formatCachePinApplyResult(applied),
        "",
        formatCachePreflightReport(preflight),
      ].join("\n"),
      display: React.createElement(CachePreparePanel, {
        model: buildCachePreparePanelModel({ applied, preflight, profileMatch }),
      }),
    };
  }
  if (args.startsWith("prepare ")) {
    const name = args.slice("prepare ".length).trim();
    if (!name) return { message: "Usage: /cache profile prepare <name>" };
    const profile = service.load(name);
    if (!profile) return { message: `Cache profile not found: ${name}` };
    const applied = applyCachePinSuggestions(context.config.projectPath, { goal: profile.goal, limit: 4 });
    const preflight = buildGoalPreflight(context, profile.goal);
    const updated = service.saveFromPreflight({
      name: profile.name,
      preflight,
      pinNames: new CachePinService(context.config.projectPath).list().map((pin) => pin.name),
    });
    return {
      message: [
        "DeepSeek cache profile prepare",
        `profile=${updated.name}`,
        formatCachePinApplyResult(applied),
        "",
        formatCachePreflightReport(preflight),
      ].join("\n"),
      display: React.createElement(CachePreparePanel, { model: buildCachePreparePanelModel({ applied, preflight }) }),
    };
  }
  if (args.startsWith("show ")) {
    const name = args.slice("show ".length).trim();
    const profile = service.load(name);
    if (!profile) return { message: `Cache profile not found: ${name}` };
    return {
      message: formatCacheProfile(profile),
      display: React.createElement(CacheProfilePanel, {
        model: buildCacheProfilePanelModel({ profiles: service.list(), selected: profile, action: "show" }),
      }),
    };
  }
  if (args.startsWith("remove ")) {
    const name = args.slice("remove ".length).trim();
    const removed = service.remove(name);
    const profiles = service.list();
    return {
      message: removed ? `removed cache profile ${name}` : `Cache profile not found: ${name}`,
      display: React.createElement(CacheProfilePanel, {
        model: buildCacheProfilePanelModel({ profiles, action: "removed" }),
      }),
    };
  }
  if (args === "path" || args.startsWith("path ")) {
    const name = args.startsWith("path ") ? args.slice("path ".length).trim() : undefined;
    return { message: service.path(name) };
  }
  return { message: "Usage: /cache profile list|audit|clean [--apply]|forecast <goal>|match <goal>|auto <goal>|save <name> <goal>|prepare <name>|show <name>|remove <name>|path [name]" };
}

function handleCacheShapes(args: string, projectPath: string): string {
  const service = new CacheShapeHistoryService(projectPath);
  if (args === "clear") {
    const count = service.clear();
    return `cleared ${count} cache prompt shape record${count === 1 ? "" : "s"}`;
  }
  if (args === "path") return service.path();
  const limit = args ? Number.parseInt(args, 10) : 10;
  if (args && (!Number.isFinite(limit) || limit <= 0)) return "Usage: /cache shapes [limit]|clear|path";
  return formatCacheShapeHistory(service.list(limit || 10));
}

function handleCachePin(args: string, projectPath: string): string {
  const service = new CachePinService(projectPath);
  if (args === "audit") {
    return formatCachePinAudit(auditCachePins(projectPath));
  }
  if (args === "suggest" || args.startsWith("suggest ")) {
    const goal = args.startsWith("suggest ") ? args.slice("suggest ".length).trim() : "";
    return formatCachePinSuggestions(suggestCachePins(projectPath, { goal, limit: 6 }));
  }
  if (args.startsWith("from ")) {
    const [sourcePath, requestedName] = splitCachePinFromArgs(args.slice("from ".length).trim());
    if (!sourcePath) return "Usage: /cache pin from <file> [name]";
    try {
      const result = createCachePinFromSource(projectPath, sourcePath, requestedName);
      return [
        `cache pin ${result.name} saved from ${result.sourcePath}`,
        `chars=${result.chars}${result.alreadyPinned ? " replaced-existing" : ""}`,
        result.path,
      ].join("\n");
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  if (!args || args === "list") {
    const pins = service.list();
    if (pins.length === 0) return "No cache pins. Add stable facts with /cache pin add <name> <content>.";
    return pins.map((pin) => `${pin.name} chars=${pin.chars} ${pin.path}`).join("\n");
  }
  if (args.startsWith("add ")) {
    const [name, ...contentParts] = args.slice("add ".length).trim().split(/\s+/);
    if (!name || contentParts.length === 0) return "Usage: /cache pin add <name> <content>";
    try {
      const pin = service.create(name, contentParts.join(" "));
      return `cache pin ${pin.name} saved: ${pin.path}`;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  if (args.startsWith("show ")) {
    const name = args.slice("show ".length).trim();
    const pin = service.load(name);
    return pin ? [`${pin.name} chars=${pin.chars}`, pin.path, "", pin.content].join("\n") : `Cache pin not found: ${name}`;
  }
  if (args.startsWith("remove ")) {
    const name = args.slice("remove ".length).trim();
    return service.remove(name) ? `removed cache pin ${name}` : `Cache pin not found: ${name}`;
  }
  if (args === "path" || args.startsWith("path ")) {
    const name = args.startsWith("path ") ? args.slice("path ".length).trim() : undefined;
    return service.path(name);
  }
  return "Usage: /cache pin list|audit|apply [goal]|suggest [goal]|from <file> [name]|add <name> <content>|show <name>|remove <name>|path [name]";
}

function splitCachePinFromArgs(args: string): [string | undefined, string | undefined] {
  const trimmed = args.trim();
  if (!trimmed) return [undefined, undefined];
  const quoted = /^"([^"]+)"(?:\s+(\S+))?$/.exec(trimmed) ?? /^'([^']+)'(?:\s+(\S+))?$/.exec(trimmed);
  if (quoted) return [quoted[1], quoted[2]];
  const [sourcePath, name] = trimmed.split(/\s+/, 2);
  return [sourcePath, name];
}

function formatCacheTrend(context: CommandContext): string {
  const runs = context.state.listRuns(5);
  const events = context.state.listEvents(undefined, 200);
  const budgetEvents = events.filter((event) => event.kind === "agent_kernel_budget_plan");
  const cacheEvents = events.filter((event) => event.kind === "cache_prompt_plan");
  const latestHashes = budgetEvents
    .map((event) => stringPayloadValue(event.payload, "stable_hash"))
    .filter((value): value is string => Boolean(value))
    .slice(0, 8);
  const uniqueHashes = Array.from(new Set(latestHashes));
  const dynamicChars = budgetEvents
    .map((event) => numberPayloadValue(event.payload, "dynamic_chars"))
    .filter((value): value is number => Number.isFinite(value));
  const averageDynamicChars = dynamicChars.length
    ? Math.round(dynamicChars.reduce((sum, value) => sum + value, 0) / dynamicChars.length)
    : 0;
  const dropped = budgetEvents
    .map((event) => numberPayloadValue(event.payload, "dropped_blocks"))
    .filter((value): value is number => Number.isFinite(value))
    .reduce((sum, value) => sum + value, 0);
  const rows = runs.map((run, index) => {
    const hit = run.cacheHitTokens ?? 0;
    const miss = run.cacheMissTokens ?? 0;
    const total = hit + miss;
    const rate = total > 0 ? `${Math.round((hit / total) * 1000) / 10}%` : "n/a";
    return `${index + 1}. ${run.status} cache=${rate} hit=${hit} miss=${miss} actions=${run.actionCount} ${run.id}`;
  });
  const driftReason = uniqueHashes.length > 1
    ? `稳定前缀出现 ${uniqueHashes.length} 个 hash，可能有系统前缀、工具 schema、skills 索引或 pin 内容漂移。`
    : uniqueHashes.length === 1
      ? "稳定前缀 hash 近期保持一致。"
      : "暂无 budget hash 事件；下一次模型调用后会记录。";
  const dynamicAdvice = averageDynamicChars > 12000
    ? "动态块偏大：建议 compact、减少 memory 召回、只加载命中的 skill 摘要。"
    : averageDynamicChars > 0
      ? "动态块在预算内；继续观察 cache miss 和 tool 摘要膨胀。"
      : "暂无动态块统计。";
  return [
    "DeepSeek cache trend",
    "最近 5 个 run:",
    ...(rows.length ? rows : ["无 run 记录。"]),
    "",
    `stableHash=${uniqueHashes[0] ?? "n/a"} unique_recent=${uniqueHashes.length}`,
    `budget_events=${budgetEvents.length} cache_plan_events=${cacheEvents.length}`,
    `avg_dynamic_chars=${averageDynamicChars || "n/a"} dropped_blocks=${dropped}`,
    `低命中原因: ${driftReason}`,
    `建议: ${dynamicAdvice}`,
    averageDynamicChars > 0 ? `预计浪费金额线索: 动态块越大，cache miss 时重复计费越高；先压到 12k chars 以下。` : "",
  ].filter(Boolean).join("\n");
}

function numberPayloadValue(payload: unknown, key: string): number | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" ? value : undefined;
}

function stringPayloadValue(payload: unknown, key: string): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function splitFirstToken(args: string): [string | undefined, string | undefined] {
  const trimmed = args.trim();
  if (!trimmed) return [undefined, undefined];
  const [first, ...rest] = trimmed.split(/\s+/);
  return [first, rest.join(" ").trim() || undefined];
}
