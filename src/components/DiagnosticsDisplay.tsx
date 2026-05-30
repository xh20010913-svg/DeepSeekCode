import React from "react";
import { Box, Text } from "ink";
import type { RuntimeConfig } from "../bootstrap/config.js";
import type { RuntimePermissionState } from "../services/permissions/permissionProfiles.js";
import type { RunRecord } from "../state/sqlite.js";
import { Pane } from "./design/Pane.js";
import { SelectList, type SelectListOption } from "./design/SelectList.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";
import { ctrlOToExpand } from "./CtrlOToExpand.js";

export interface DiagnosticsDisplayModel {
  title: string;
  summary: string;
  badge: string;
  badgeTone: TerminalTone;
  checks: DiagnosticCheckRow[];
  footer: string;
}

export interface DiagnosticCheckRow {
  id: string;
  label: string;
  status: string;
  tone: TerminalTone;
  detail: string;
  action: string;
}

export function DiagnosticsDisplay(props: {
  model: DiagnosticsDisplayModel;
  width?: number;
}): React.ReactElement {
  const width = Math.max(56, Math.min(112, props.width ?? 88));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="doctor" tone={props.model.badgeTone} paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.summary, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={props.model.badge} tone={props.model.badgeTone} />
        </Box>
        <Box marginTop={1}>
          <Text color="gray">checks</Text>
        </Box>
        <SelectList
          options={diagnosticsDisplayOptions(props.model)}
          selectedIndex={firstActionableCheckIndex(props.model.checks)}
          visibleCount={8}
          width={width}
        />
        <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
      </Pane>
    </Box>
  );
}

export function diagnosticsDisplayOptions(model: DiagnosticsDisplayModel): SelectListOption[] {
  return model.checks.map((check) => ({
    id: check.id,
    label: check.label,
    detail: `${check.status} | ${check.detail}`,
    description: check.action,
    selected: check.tone === "error" || check.tone === "warning",
    tone: check.tone,
  }));
}

export function diagnosticsDisplayModel(input: {
  config: RuntimeConfig;
  providerReady: boolean;
  providerName?: string;
  permissions: RuntimePermissionState;
  runs: RunRecord[];
}): DiagnosticsDisplayModel {
  const checks: DiagnosticCheckRow[] = [
    check("project", "project", "ok", "brand", input.config.projectPath, "/project"),
    check("data", "data", "ok", "muted", input.config.dataDir, "/config"),
    check("state", "state", "ok", "muted", input.config.stateDbPath, "/status"),
    input.providerReady
      ? check("provider", "provider", "ready", "success", input.providerName ?? input.config.model, "/model")
      : check("provider", "provider", "missing", "error", "DEEPSEEK_API_KEY not configured", "set DEEPSEEK_API_KEY or configure .deepseekcode/providers.json"),
    permissionCheck(input.permissions, input.config.permissionProfile),
    check("runs", "recent runs", `${input.runs.length}`, input.runs.length > 0 ? "brand" : "muted", latestRunDetail(input.runs), "/runs"),
  ];
  const problems = checks.filter((row) => row.tone === "error" || row.tone === "warning").length;
  return {
    title: "DeepSeekCode doctor",
    summary: `${checks.length} checks | ${problems} attention item${problems === 1 ? "" : "s"}`,
    badge: problems > 0 ? `${problems} issue${problems === 1 ? "" : "s"}` : "ok",
    badgeTone: problems > 0 ? "warning" : "success",
    checks,
    footer: `/status | /config | /cache doctor current | /permissions status | ${ctrlOToExpand()}`,
  };
}

function check(
  id: string,
  label: string,
  status: string,
  tone: TerminalTone,
  detail: string,
  action: string,
): DiagnosticCheckRow {
  return { id, label, status, tone, detail, action };
}

function permissionCheck(permissions: RuntimePermissionState, fallbackProfile: string): DiagnosticCheckRow {
  const profile = permissions.profile ?? fallbackProfile;
  const elevated = permissions.allowShell || permissions.allowBrowser;
  const detail = [
    profile,
    `shell ${permissions.allowShell ? "on" : "off"}`,
    `browser ${permissions.allowBrowser ? "on" : "off"}`,
  ].join(" | ");
  return check(
    "permissions",
    "permissions",
    elevated ? "elevated" : "safe",
    elevated ? "warning" : "success",
    detail,
    "/permissions status",
  );
}

function latestRunDetail(runs: RunRecord[]): string {
  const latest = runs[0];
  if (!latest) return "no persisted runs";
  return `${latest.id} ${latest.status} actions=${latest.actionCount} events=${latest.eventCount}`;
}

function firstActionableCheckIndex(checks: DiagnosticCheckRow[]): number {
  const index = checks.findIndex((check) => check.tone === "error" || check.tone === "warning");
  return Math.max(0, index);
}
