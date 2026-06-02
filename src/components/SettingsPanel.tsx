import React from "react";
import { Box, Text } from "ink";
import type { InferenceBudget } from "../services/inference/inferenceSettingsService.js";
import type { ProjectStatusSummary } from "../services/status/projectStatus.js";
import { terminalThemes } from "../services/theme/themeCatalog.js";
import type { ThemeSettings } from "../services/theme/themeService.js";
import type { OutputStyle } from "../outputStyles/index.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { ProgressBar } from "./design/ProgressBar.js";
import { SelectList, type SelectListOption } from "./design/SelectList.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { Tabs, type TabItem } from "./design/Tabs.js";
import { truncateCells } from "./design/textLayout.js";
import { toneColor, type TerminalTone } from "./design/terminalTheme.js";
import { ThemePicker, themePickerModel, type ThemePickerModel } from "./ThemePicker.js";

export type SettingsTabId = "status" | "config" | "usage" | "gates" | "theme";

export interface SettingsPanelModel {
  title: string;
  subtitle: string;
  selectedTab: SettingsTabId;
  badge: string;
  badgeTone: TerminalTone;
  tabs: TabItem[];
  rows: SettingsPanelRow[];
  actions: SelectListOption[];
  cacheRatio: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  themePicker?: ThemePickerModel;
  footer: string;
}

export interface SettingsPanelRow {
  key: string;
  label: string;
  status: string;
  tone: TerminalTone;
  detail: string;
  note: string;
}

export function SettingsPanel(props: {
  model: SettingsPanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(62, Math.min(116, columns - 4));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="settings" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color={toneColor("brand")}>{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={props.model.badge} tone={props.model.badgeTone} />
        </Box>
        <Box marginTop={1}>
          <Tabs tabs={props.model.tabs} selectedId={props.model.selectedTab} title="tab" width={width} />
        </Box>
        <Box marginTop={1} marginBottom={1}>
          <Text color="gray">cache </Text>
          <ProgressBar ratio={props.model.cacheRatio} width={Math.max(12, Math.min(32, width - 34))} filledTone={cacheTone(props.model.cacheRatio, props.model.cacheHitTokens + props.model.cacheMissTokens)} />
          <Text color="gray"> hit {props.model.cacheHitTokens} / miss {props.model.cacheMissTokens}</Text>
        </Box>
        <Box flexDirection="column">
          {props.model.rows.map((row) => (
            <SettingsPanelRowView key={row.key} row={row} width={width} />
          ))}
        </Box>
        {props.model.themePicker ? (
          <ThemePicker model={props.model.themePicker} width={width - 2} />
        ) : null}
        <Box marginTop={1}>
          <Text color="gray">actions</Text>
        </Box>
        <SelectList options={props.model.actions} selectedIndex={0} visibleCount={5} width={width} />
        <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
      </Pane>
    </Box>
  );
}

export function settingsPanelModel(input: {
  tab?: string;
  status: ProjectStatusSummary;
  outputStyle: OutputStyle;
  inference: InferenceBudget;
  theme: ThemeSettings;
}): SettingsPanelModel {
  const selectedTab = normalizeSettingsTab(input.tab);
  const cacheTotal = input.status.cache.hitTokens + input.status.cache.missTokens;
  const cacheRatio = cacheTotal > 0 ? input.status.cache.hitTokens / cacheTotal : 0;
  return {
    title: "DeepSeekCode settings",
    subtitle: `${input.status.projectPath} / ${input.status.model}`,
    selectedTab,
    badge: selectedTab,
    badgeTone: selectedTab === "gates" && input.status.gates.approvalsPending > 0 ? "warning" : "brand",
    tabs: [
      { id: "status", title: "status", tone: "brand" },
      { id: "config", title: "config", tone: "muted" },
      { id: "usage", title: "usage", tone: "muted" },
      { id: "gates", title: "gates", count: input.status.gates.approvalsPending, tone: input.status.gates.approvalsPending > 0 ? "warning" : "muted" },
      { id: "theme", title: "theme", count: terminalThemes.length, tone: "brand" },
    ],
    rows: rowsForTab(selectedTab, input),
    actions: actionsForTab(selectedTab),
    cacheRatio,
    cacheHitTokens: input.status.cache.hitTokens,
    cacheMissTokens: input.status.cache.missTokens,
    themePicker: selectedTab === "theme"
      ? themePickerModel({ themes: terminalThemes, current: input.theme })
      : undefined,
    footer: "/settings status|config|usage|gates|theme",
  };
}

export function normalizeSettingsTab(value: string | undefined): SettingsTabId {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "config") return "config";
  if (normalized === "usage") return "usage";
  if (normalized === "gates" || normalized === "gate") return "gates";
  if (normalized === "theme" || normalized === "themes" || normalized === "appearance" || normalized === "color") return "theme";
  return "status";
}

function SettingsPanelRowView(props: {
  row: SettingsPanelRow;
  width: number;
}): React.ReactElement {
  const detailWidth = Math.max(24, props.width - 42);
  const noteWidth = Math.max(24, props.width - 12);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row">
        <StatusBadge label={props.row.status} tone={props.row.tone} />
        <Text> </Text>
        <Text color={toneColor("brand")}>{truncateCells(props.row.label.padEnd(13), 13)}</Text>
        <Text color="gray">{truncateCells(props.row.detail, detailWidth)}</Text>
      </Box>
      {props.row.note ? (
        <Box paddingLeft={2}>
          <Text color="gray">{truncateCells(props.row.note, noteWidth)}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

function rowsForTab(tab: SettingsTabId, input: {
  status: ProjectStatusSummary;
  outputStyle: OutputStyle;
  inference: InferenceBudget;
  theme: ThemeSettings;
}): SettingsPanelRow[] {
  if (tab === "config") {
    return [
      row("model", "active", "brand", input.status.model, input.status.providerReady ? "provider configured" : "provider missing"),
      row("theme", input.theme.source, "brand", input.theme.theme, input.theme.definition.description),
      row("style", input.outputStyle.scope, input.outputStyle.scope === "builtin" ? "brand" : "success", input.outputStyle.name, input.outputStyle.description),
      row("effort", input.inference.effort, input.inference.effort === "max" ? "warning" : "brand", `context=${input.inference.actionContextChars} dynamic=${input.inference.actionDynamicChars}`, `maxOutput=${input.inference.maxOutputTokens}`),
      row("project", "path", "muted", input.status.projectPath, "workspace root"),
      row("data", "path", "muted", input.status.dataDir, "runtime state and transcripts"),
    ];
  }

  if (tab === "usage") {
    return [
      row("cache", input.status.cache.rate, cacheTone(input.status.cache.hitTokens / Math.max(1, input.status.cache.hitTokens + input.status.cache.missTokens), input.status.cache.hitTokens + input.status.cache.missTokens), `observed runs=${input.status.cache.observedRuns}`, "DeepSeek cache hit rate matters for token savings"),
      row("runs", `${input.status.runs.totalRecent} recent`, input.status.runs.unfinished > 0 ? "warning" : "success", `unfinished=${input.status.runs.unfinished}`, input.status.runs.latest ? `latest=${input.status.runs.latest.id}` : "no runs"),
      row("tasks", `${input.status.tasks.queued} queued`, input.status.tasks.failed > 0 ? "error" : "muted", `running=${input.status.tasks.running} succeeded=${input.status.tasks.succeeded}`, `failed=${input.status.tasks.failed} paused=${input.status.tasks.paused}`),
      row("budget", input.inference.effort, input.inference.effort === "max" ? "warning" : "brand", `side=${input.inference.sideQuestionContextChars}/${input.inference.sideQuestionDynamicChars}`, `maxOutput=${input.inference.maxOutputTokens}`),
    ];
  }

  if (tab === "gates") {
    return [
      row("approval", `${input.status.gates.approvalsPending} pending`, input.status.gates.approvalsPending > 0 ? "warning" : "success", "/approval list", "manual approvals block tool execution until decided"),
      row("validation", `${input.status.gates.validationsPending} pending`, input.status.gates.validationsFailed > 0 ? "error" : "muted", `failed=${input.status.gates.validationsFailed}`, "/validation"),
      row("permissions", input.status.permissionProfile, permissionTone(input.status), `shell=${onOff(input.status.permissions.shell)} browser=${onOff(input.status.permissions.browser)}`, "/permissions profile safe|dev|browser|open"),
      row("git", input.status.git.available ? input.status.git.clean ? "clean" : "dirty" : "unavailable", gitTone(input.status), gitDetail(input.status), input.status.git.error ?? ""),
    ];
  }

  if (tab === "theme") {
    const colors = input.theme.definition.colors;
    return [
      row("current", input.theme.source, "brand", input.theme.theme, input.theme.definition.description),
      row("palette", "colors", "brand", `brand=${colors.brand ?? "default"} success=${colors.success ?? "default"}`, `warning=${colors.warning ?? "default"} error=${colors.error ?? "default"}`),
      row("override", process.env.DEEPSEEKCODE_THEME ? "env" : "project", process.env.DEEPSEEKCODE_THEME ? "warning" : "success", process.env.DEEPSEEKCODE_THEME ? "DEEPSEEKCODE_THEME" : ".deepseekcode/theme.json", "env override wins for the current process"),
      row("path", "config", "muted", input.theme.path, "/theme path shows the same file"),
    ];
  }

  return [
    row("provider", input.status.providerReady ? "ready" : "missing", input.status.providerReady ? "success" : "error", input.status.model, input.status.providerReady ? "DeepSeek provider configured" : "configure DEEPSEEK_API_KEY"),
    row("permissions", input.status.permissionProfile, permissionTone(input.status), `shell=${onOff(input.status.permissions.shell)} browser=${onOff(input.status.permissions.browser)}`, "use /permissions to switch profile"),
    row("theme", input.theme.theme, "brand", input.theme.definition.label, `source=${input.theme.source}`),
    row("runs", `${input.status.runs.unfinished} open`, input.status.runs.unfinished > 0 ? "warning" : "success", `recent=${input.status.runs.totalRecent}`, input.status.runs.latest ? `latest=${input.status.runs.latest.status} ${input.status.runs.latest.id}` : "no runs"),
    row("gates", `${input.status.gates.approvalsPending} approval`, input.status.gates.approvalsPending > 0 ? "warning" : "success", `validating=${input.status.gates.validationsPending}`, `failed validations=${input.status.gates.validationsFailed}`),
    row("git", input.status.git.available ? input.status.git.clean ? "clean" : "dirty" : "unavailable", gitTone(input.status), gitDetail(input.status), input.status.git.error ?? ""),
  ];
}

function actionsForTab(tab: SettingsTabId): SelectListOption[] {
  const common = (id: string, label: string, detail: string, description: string, tone: TerminalTone = "brand"): SelectListOption => ({
    id,
    label,
    detail,
    description,
    tone,
  });
  if (tab === "config") {
    return [
      common("config", "config", "/config", "show redacted runtime configuration"),
      common("theme", "theme", "/theme list", "inspect or change terminal theme"),
      common("style", "style", "/output-style list", "choose response style"),
      common("effort", "effort", "/effort status", "inspect DeepSeek prompt budget"),
    ];
  }
  if (tab === "usage") {
    return [
      common("usage", "usage", "/usage", "show token and cache usage"),
      common("stats", "stats", "/stats", "summarize workspace activity"),
      common("cost", "cost", "/cost", "estimate DeepSeek cost if pricing is configured"),
      common("cache", "cache plan", "/cache plan <goal>", "preview prompt budget before spending tokens", "success"),
    ];
  }
  if (tab === "gates") {
    return [
      common("approval", "approval", "/approval list", "decide pending tool approvals", "warning"),
      common("permissions", "permissions", "/permissions status", "review shell and browser safety"),
      common("validation", "validation", "/validation", "inspect validation gates"),
      common("plan", "plan", "/plan status", "review plan-mode approval state"),
    ];
  }
  if (tab === "theme") {
    return [
      common("theme-list", "theme list", "/theme list", "show all built-in terminal themes"),
      common("theme-cache", "cache green", "/theme set cache-green", "use the cache-first DeepSeek palette", "success"),
      common("theme-warm", "warm classic", "/theme set warm-classic", "use the warmer terminal palette"),
      common("theme-reset", "theme reset", "/theme reset", "return to the default DeepSeek palette", "warning"),
    ];
  }
  return [
    common("doctor", "doctor", "/doctor", "run diagnostics"),
    common("status", "status", "/status", "show detailed project status"),
    common("cache", "cache", "/cache doctor current", "inspect cache health", "success"),
    common("runs", "runs", "/runs", "review recent runs"),
  ];
}

function row(
  key: string,
  status: string,
  tone: TerminalTone,
  detail: string,
  note: string,
): SettingsPanelRow {
  return { key, label: key, status, tone, detail, note };
}

function cacheTone(ratio: number, total: number): TerminalTone {
  if (total <= 0) return "muted";
  if (ratio >= 0.75) return "success";
  if (ratio >= 0.35) return "warning";
  return "error";
}

function permissionTone(status: ProjectStatusSummary): TerminalTone {
  if (status.permissions.shell && status.permissions.browser) return "warning";
  if (status.permissions.shell || status.permissions.browser) return "brand";
  return "success";
}

function gitTone(status: ProjectStatusSummary): TerminalTone {
  if (!status.git.available) return "muted";
  if (status.git.conflicted > 0) return "error";
  return status.git.clean ? "success" : "warning";
}

function gitDetail(status: ProjectStatusSummary): string {
  const git = status.git;
  if (!git.available) return "git unavailable";
  if (git.clean) return "working tree clean";
  return `M=${git.modified} A=${git.added} D=${git.deleted} R=${git.renamed} ?=${git.untracked} U=${git.conflicted}`;
}

function onOff(value: boolean): string {
  return value ? "on" : "off";
}
