import React from "react";
import { Box, Text } from "ink";
import type {
  CacheProfile,
  CacheProfileCleanupPlan,
  CacheProfileAuditReport,
  CacheProfileAuditSeverity,
  CacheProfileForecast,
  CacheProfileMatch,
} from "../services/cache/cacheProfiles.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { ProgressBar } from "./design/ProgressBar.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface CacheProfilePanelModel {
  title: string;
  subtitle: string;
  badge: string;
  badgeTone: TerminalTone;
  ratio: number;
  summary: string;
  rows: CacheProfilePanelRow[];
  footer: string;
}

export interface CacheProfilePanelRow {
  key: string;
  label: string;
  tone: TerminalTone;
  name: string;
  detail: string;
}

export function CacheProfilePanel(props: {
  model: CacheProfilePanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(62, Math.min(116, columns - 4));
  const nameWidth = Math.max(14, Math.min(28, Math.floor(width * 0.27)));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="cache profile" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={props.model.badge} tone={props.model.badgeTone} />
        </Box>
        <Box flexDirection="row" marginTop={1}>
          <StatusBadge label="reuse" tone={props.model.badgeTone} />
          <Text> </Text>
          <ProgressBar ratio={props.model.ratio} width={Math.max(12, Math.min(28, width - 48))} showPercent />
          <Text color="gray"> {truncateCells(props.model.summary, Math.max(16, width - 46))}</Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {props.model.rows.map((row) => (
            <Box key={row.key} flexDirection="row">
              <StatusBadge label={row.label} tone={row.tone} />
              <Text> {truncateCells(row.name.padEnd(nameWidth), nameWidth)} </Text>
              <Text color="gray">{truncateCells(row.detail, Math.max(12, width - nameWidth - 14))}</Text>
            </Box>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
        </Box>
      </Pane>
    </Box>
  );
}

export function buildCacheProfilePanelModel(input: {
  profiles: CacheProfile[];
  selected?: CacheProfile;
  matches?: CacheProfileMatch[];
  audit?: CacheProfileAuditReport;
  cleanup?: CacheProfileCleanupPlan;
  forecast?: CacheProfileForecast;
  queryGoal?: string;
  action?: "list" | "saved" | "show" | "removed" | "match" | "audit" | "clean" | "forecast";
}): CacheProfilePanelModel {
  const action = input.action ?? (input.selected ? "show" : "list");
  const selected = input.selected ?? input.forecast?.profile ?? input.matches?.[0]?.profile ?? input.profiles[0];
  const rows = action === "match"
    ? matchRows(input.matches ?? [])
    : action === "forecast"
      ? forecastRows(input.forecast)
    : action === "audit"
      ? auditRows(input.audit)
      : action === "clean"
        ? cleanupRows(input.cleanup)
    : selected ? profileRows(selected) : [{
    key: "empty",
    label: "none",
    tone: "muted" as const,
    name: "no-profile",
    detail: "save one with /cache profile save <name> <goal>",
  }];
  if (!input.selected && input.profiles.length > 1) {
    rows.push(...input.profiles.slice(1, 6).map((profile) => ({
      key: `profile:${profile.name}`,
      label: profile.status,
      tone: toneForStatus(profile.status),
      name: profile.name,
      detail: `score=${profile.readinessScore} shape=${profile.shapeFingerprint} goal=${profile.goal}`,
    })));
  }
  return {
    title: action === "saved"
      ? "DeepSeek cache profile saved"
      : action === "match"
      ? "DeepSeek cache profile match"
      : action === "forecast"
        ? "DeepSeek cache profile forecast"
        : action === "audit"
          ? "DeepSeek cache profile audit"
          : action === "clean"
            ? "DeepSeek cache profile clean"
        : "DeepSeek cache profiles",
    subtitle: action === "match"
      ? input.queryGoal ?? "match reusable cache preparation"
      : action === "forecast"
        ? input.queryGoal ?? input.forecast?.goal ?? "forecast reusable prefix"
      : action === "audit"
        ? input.audit?.recommendation ?? "profile quality checks"
        : action === "clean"
          ? input.cleanup?.recommendation ?? "profile cleanup preview"
        : selected ? selected.goal : "reusable cache preparation recipes",
    badge: action === "removed" ? "removed" : action === "forecast" ? input.forecast?.status ?? "empty" : action === "audit" ? input.audit?.severity ?? "empty" : action === "clean" ? input.cleanup?.apply ? "cleaned" : "preview" : selected?.status ?? "empty",
    badgeTone: action === "removed" ? "muted" : action === "forecast" ? toneForForecast(input.forecast?.status ?? "cold") : action === "audit" ? toneForAudit(input.audit?.severity ?? "ok") : action === "clean" ? input.cleanup?.candidateCount ? "warning" : "success" : selected ? toneForStatus(selected.status) : "muted",
    ratio: action === "audit"
      ? input.audit && input.audit.profileCount > 0 ? input.audit.healthyCount / input.audit.profileCount : 0
      : action === "forecast"
        ? input.forecast?.estimatedHitRate ?? 0
      : action === "clean"
        ? input.cleanup && input.cleanup.candidateCount > 0 ? input.cleanup.removed.length / input.cleanup.candidateCount : 1
      : (selected?.readinessScore ?? 0) / 100,
    summary: action === "audit"
      ? `profiles=${input.audit?.profileCount ?? 0} healthy=${input.audit?.healthyCount ?? 0} issues=${input.audit?.issueCount ?? 0}`
      : action === "forecast"
      ? `profile=${input.forecast?.profile?.name ?? "none"} reusable~${input.forecast?.reusableTokens ?? 0} hit=${Math.round((input.forecast?.estimatedHitRate ?? 0) * 100)}%`
      : action === "clean"
      ? `candidates=${input.cleanup?.candidateCount ?? 0} removed=${input.cleanup?.removed.length ?? 0} mode=${input.cleanup?.apply ? "apply" : "preview"}`
      : action === "match"
      ? `matches=${input.matches?.length ?? 0}${selected ? ` best=${selected.name} score=${input.matches?.[0]?.score ?? 0}` : ""}`
      : selected
      ? `profiles=${input.profiles.length} score=${selected.readinessScore} pins=${selected.pinNames.length} effort=${selected.effort}`
      : "profiles=0 score=0 pins=0",
    rows,
    footer: action === "audit"
      ? "/cache profile prepare <name> | /cache profile remove <name> | /cache profile auto <goal>"
      : action === "forecast" && input.forecast
      ? input.forecast.nextCommands.slice(0, 3).join(" | ")
      : action === "clean"
      ? "/cache profile clean --apply | /cache profile audit | /cache profile list"
      : action === "match" && input.matches?.[0]
      ? `/cache profile prepare ${input.matches[0].profile.name} | /cache profile show ${input.matches[0].profile.name} | /cache profile save <name> <goal>`
      : selected
      ? `/cache profile prepare ${selected.name} | /cache profile show ${selected.name} | /cache profile list`
      : "/cache profile save <name> <goal> | /cache prepare <goal>",
  };
}

function forecastRows(forecast?: CacheProfileForecast): CacheProfilePanelRow[] {
  if (!forecast) {
    return [{
      key: "forecast:empty",
      label: "none",
      tone: "muted",
      name: "forecast",
      detail: "run /cache profile forecast <goal>",
    }];
  }
  return [
    {
      key: "forecast:profile",
      label: forecast.profile ? "prof" : "none",
      tone: forecast.profile ? toneForForecast(forecast.status) : "muted",
      name: forecast.profile?.name ?? "no-match",
      detail: forecast.reason,
    },
    {
      key: "forecast:tokens",
      label: "reuse",
      tone: toneForForecast(forecast.status),
      name: `${Math.round(forecast.estimatedHitRate * 100)}% hit`,
      detail: `current~${forecast.currentTokens} stable~${forecast.stableTokens} reusable~${forecast.reusableTokens}`,
    },
    {
      key: "forecast:dynamic",
      label: "dyn",
      tone: forecast.dynamicTokens > forecast.stableTokens ? "warning" : "success",
      name: `dynamic~${forecast.dynamicTokens}`,
      detail: `preflight=${forecast.preflightStatus} profileStable~${forecast.profileStableTokens}`,
    },
    ...forecast.recommendations.slice(0, 3).map((recommendation, index) => ({
      key: `forecast:rec:${index}`,
      label: "tip",
      tone: "brand" as const,
      name: `next ${index + 1}`,
      detail: recommendation,
    })),
  ];
}

function cleanupRows(plan?: CacheProfileCleanupPlan): CacheProfilePanelRow[] {
  if (!plan || plan.candidateCount === 0) {
    return [{
      key: "clean:empty",
      label: "ok",
      tone: "success",
      name: "profiles",
      detail: "no cleanup candidates",
    }];
  }
  return plan.candidates.slice(0, 8).map((candidate, index) => ({
    key: `clean:${candidate.profile}:${index}`,
    label: plan.removed.includes(candidate.profile) ? "rm" : "cand",
    tone: candidate.severity === "error" ? "error" : "warning",
    name: candidate.profile,
    detail: `${candidate.reason} | codes=${candidate.codes.join(",")} | ${candidate.command}`,
  }));
}

function auditRows(report?: CacheProfileAuditReport): CacheProfilePanelRow[] {
  if (!report || report.profileCount === 0) {
    return [{
      key: "audit:empty",
      label: "none",
      tone: "muted",
      name: "no-profile",
      detail: "save one with /cache profile save <name> <goal>",
    }];
  }
  if (report.issues.length === 0) {
    return [{
      key: "audit:ok",
      label: "ok",
      tone: "success",
      name: "profiles",
      detail: report.recommendation,
    }];
  }
  return report.issues.slice(0, 8).map((issue, index) => ({
    key: `audit:${issue.profile}:${issue.code}:${index}`,
    label: issue.severity,
    tone: toneForAudit(issue.severity),
    name: issue.profile,
    detail: `${issue.code}: ${issue.message} | ${issue.command}`,
  }));
}

function matchRows(matches: CacheProfileMatch[]): CacheProfilePanelRow[] {
  if (matches.length === 0) {
    return [{
      key: "match:none",
      label: "none",
      tone: "muted",
      name: "no-match",
      detail: "save a profile or run /cache prepare for this goal first",
    }];
  }
  return matches.slice(0, 6).map((match, index) => ({
    key: `match:${match.profile.name}`,
    label: index === 0 ? "best" : String(index + 1),
    tone: index === 0 ? "success" : toneForStatus(match.profile.status),
    name: match.profile.name,
    detail: `score=${match.score} ${match.reason} | ${match.command}`,
  }));
}

function profileRows(profile: CacheProfile): CacheProfilePanelRow[] {
  return [
    {
      key: "goal",
      label: "goal",
      tone: "brand",
      name: profile.name,
      detail: profile.goal,
    },
    {
      key: "shape",
      label: "shape",
      tone: toneForRisk(profile.stabilityRisk),
      name: profile.shapeFingerprint,
      detail: `${profile.shapeRepeat} risk=${profile.stabilityRisk} dynamic=${Math.round(profile.dynamicShare * 100)}%`,
    },
    {
      key: "ready",
      label: "ready",
      tone: toneForStatus(profile.status),
      name: profile.readinessStatus,
      detail: `score=${profile.readinessScore} tokens~${profile.planTokens} dropped=${profile.droppedChars}`,
    },
    {
      key: "pins",
      label: "pin",
      tone: profile.pinNames.length > 0 ? "success" : "warning",
      name: `${profile.pinNames.length} pins`,
      detail: profile.pinNames.length ? profile.pinNames.slice(0, 6).join(",") : "run /cache prepare before large tasks",
    },
    ...profile.nextCommands.slice(0, 3).map((command, index) => ({
      key: `cmd:${index}`,
      label: "cmd",
      tone: "brand" as const,
      name: `next ${index + 1}`,
      detail: command,
    })),
  ];
}

function toneForStatus(status: string): TerminalTone {
  if (status === "ready") return "success";
  if (status === "blocked") return "error";
  return "warning";
}

function toneForAudit(severity: CacheProfileAuditSeverity): TerminalTone {
  if (severity === "error") return "error";
  if (severity === "warning") return "warning";
  return "success";
}

function toneForForecast(status: string): TerminalTone {
  if (status === "blocked") return "error";
  if (status === "strong") return "success";
  if (status === "warming") return "warning";
  return "muted";
}

function toneForRisk(risk: string): TerminalTone {
  if (risk === "high") return "error";
  if (risk === "medium") return "warning";
  return "success";
}
