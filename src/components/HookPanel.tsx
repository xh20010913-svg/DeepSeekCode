import React from "react";
import { Box, Text } from "ink";
import type { HookDefinition, HooksValidationResult } from "../hooks/config.js";
import { HOOK_EVENTS } from "../hooks/events.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { SelectList, type SelectListOption } from "./design/SelectList.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { Tabs, type TabItem } from "./design/Tabs.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

const HOOK_EVENT_DESCRIPTIONS: Record<string, string> = {
  PreToolUse: "runs before a matching tool is executed and may block the operation",
  PostToolUse: "runs after a matching tool completes successfully",
  PostToolUseFailure: "runs after a matching tool fails",
  UserPromptSubmit: "runs after a user prompt is submitted",
  SessionStart: "runs when a DeepSeekCode session starts",
  Stop: "runs when the session exits normally",
  StopFailure: "runs when the session exits with an error",
  PreCompact: "runs before context compaction",
  PostCompact: "runs after context compaction",
  TaskCreated: "runs when a task is created",
  TaskCompleted: "runs when a task completes",
  Setup: "runs during local workspace setup",
  config: "validates the hooks configuration file",
};

export interface HookPanelModel {
  title: string;
  subtitle: string;
  rows: HookPanelRow[];
  footer: string;
  selectedEvent?: string;
}

export interface HookPanelRow {
  key: string;
  id: string;
  status: string;
  tone: TerminalTone;
  event: string;
  matcher: string;
  command: string;
  note: string;
}

export interface HookPanelEventSummary {
  event: string;
  hooks: number;
  enabled: number;
  disabled: number;
  matchers: number;
  tone: TerminalTone;
}

export function HookPanel(props: {
  model: HookPanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(58, Math.min(112, columns - 4));
  const tabs = hookPanelTabs(props.model);
  const eventOptions = hookPanelEventOptions(props.model);
  const selectedEvent = hookPanelSelectedEvent(props.model);
  const selectedEventIndex = Math.max(0, eventOptions.findIndex((option) => option.selected));
  const hookOptions = hookPanelHookOptions(props.model, selectedEvent);
  const selectedHook = props.model.rows.find((row) => row.event === selectedEvent) ?? props.model.rows[0];
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="hooks" tone={props.model.rows.length > 0 ? "brand" : "muted"} paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <Box flexDirection="column" alignItems="flex-end">
            <StatusBadge label={`${props.model.rows.length} hooks`} tone={props.model.rows.length > 0 ? "brand" : "muted"} />
            <Text color="gray">{hookPanelStatusLine(props.model)}</Text>
          </Box>
        </Box>
        <Box marginTop={1}>
          <Tabs selectedId="events" title="view" tabs={tabs} width={width} />
        </Box>
        <Box marginTop={1}>
          <Text color="gray">events</Text>
        </Box>
        <SelectList
          options={eventOptions}
          selectedIndex={selectedEventIndex}
          visibleCount={Math.min(7, eventOptions.length)}
          width={width}
        />
        <Box marginTop={1}>
          <Text color="gray">{selectedEvent ? `hooks for ${selectedEvent}` : "hooks"}</Text>
        </Box>
        {hookOptions.length > 0 ? (
          <SelectList options={hookOptions} selectedIndex={0} visibleCount={5} width={width} />
        ) : (
          <Text color="gray">{selectedEvent ? `No hooks bound to ${selectedEvent}` : "No hooks configured"}</Text>
        )}
        <HookDetailCard row={selectedHook} width={width} />
        <Box marginTop={1}>
          <Text color="gray">commands</Text>
        </Box>
        <SelectList options={hookPanelCommandOptions()} selectedIndex={0} visibleCount={4} width={width} />
        <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
      </Pane>
    </Box>
  );
}

export function hookListPanelModel(hooks: HookDefinition[]): HookPanelModel {
  return {
    title: "Hooks",
    subtitle: `${hooks.length} configured hook${hooks.length === 1 ? "" : "s"}`,
    selectedEvent: hooks[0]?.event,
    rows: hooks.map((hook) => ({
      key: hook.id,
      id: hook.id,
      status: hook.enabled ? "enabled" : "disabled",
      tone: hook.enabled ? "success" : "muted",
      event: hook.event,
      matcher: hook.matcher || "(all)",
      command: hook.command,
      note: hook.description || `timeout=${hook.timeout_ms}ms`,
    })),
    footer: `events: ${HOOK_EVENTS.join(", ")}`,
  };
}

export function hookValidationPanelModel(result: HooksValidationResult): HookPanelModel {
  const rows: HookPanelRow[] = [];
  rows.push({
    key: "validation",
    id: result.path,
    status: result.ok ? "ok" : "failed",
    tone: result.ok ? "success" : "error",
    event: "config",
    matcher: "-",
    command: result.ok ? "hooks.json parsed" : result.errors.join("; "),
    note: result.warnings.length > 0 ? `warning: ${result.warnings.join("; ")}` : "",
  });
  return {
    title: "Hook validation",
    subtitle: result.path,
    selectedEvent: "config",
    rows,
    footer: "/hooks add <id> <event> <matcher|-> <command...> | /hooks remove <id>",
  };
}

export function hookPanelTabs(model: HookPanelModel): TabItem[] {
  const summaries = hookPanelEventSummaries(model);
  return [
    { id: "events", title: "events", count: summaries.length, tone: "brand" },
    { id: "hooks", title: "hooks", count: model.rows.length, tone: model.rows.length > 0 ? "brand" : "muted" },
    { id: "commands", title: "commands", count: hookPanelCommandOptions().length, tone: "muted" },
  ];
}

export function hookPanelEventSummaries(model: HookPanelModel): HookPanelEventSummary[] {
  const byEvent = new Map<string, {
    hooks: number;
    enabled: number;
    disabled: number;
    matchers: Set<string>;
  }>();
  for (const event of HOOK_EVENTS) {
    byEvent.set(event, { hooks: 0, enabled: 0, disabled: 0, matchers: new Set() });
  }
  for (const row of model.rows) {
    const summary = byEvent.get(row.event) ?? { hooks: 0, enabled: 0, disabled: 0, matchers: new Set<string>() };
    summary.hooks += 1;
    if (row.status === "enabled" || row.status === "ok") {
      summary.enabled += 1;
    } else {
      summary.disabled += 1;
    }
    summary.matchers.add(row.matcher || "(all)");
    byEvent.set(row.event, summary);
  }
  return [...byEvent.entries()].map(([event, summary]) => ({
    event,
    hooks: summary.hooks,
    enabled: summary.enabled,
    disabled: summary.disabled,
    matchers: summary.matchers.size,
    tone: eventSummaryTone(summary.hooks, summary.disabled),
  }));
}

export function hookPanelEventOptions(model: HookPanelModel): SelectListOption[] {
  const selectedEvent = hookPanelSelectedEvent(model);
  return hookPanelEventSummaries(model).map((summary) => ({
    id: summary.event,
    label: summary.event,
    detail: `${summary.hooks} hooks | ${summary.matchers} matchers`,
    description: hookEventDescription(summary),
    selected: summary.event === selectedEvent,
    tone: summary.tone,
  }));
}

export function hookPanelHookOptions(model: HookPanelModel, event = hookPanelSelectedEvent(model)): SelectListOption[] {
  return model.rows
    .filter((row) => !event || row.event === event)
    .map((row) => ({
      id: row.id,
      label: row.id,
      detail: `${row.status} | ${row.matcher}`,
      description: `${row.command}${row.note ? ` -- ${row.note}` : ""}`,
      selected: row.event === event,
      disabled: row.status === "disabled",
      tone: row.tone,
    }));
}

export function hookPanelCommandOptions(): SelectListOption[] {
  return [
    {
      id: "validate",
      label: "validate",
      detail: "/hooks validate",
      description: "parse hooks.json and show errors or policy warnings",
      tone: "brand",
    },
    {
      id: "add",
      label: "add",
      detail: "/hooks add <id> <event> <matcher|-> <command...>",
      description: "register a command hook in the local project config",
      tone: "success",
    },
    {
      id: "run",
      label: "run",
      detail: "/hooks run <event> [payload-json]",
      description: "execute matching hooks with a small test payload",
      tone: "warning",
    },
    {
      id: "remove",
      label: "remove",
      detail: "/hooks remove <id>",
      description: "remove a configured hook by id",
      tone: "muted",
    },
  ];
}

function hookPanelSelectedEvent(model: HookPanelModel): string | undefined {
  if (model.selectedEvent) return model.selectedEvent;
  return model.rows[0]?.event ?? HOOK_EVENTS[0];
}

function hookPanelStatusLine(model: HookPanelModel): string {
  const enabled = model.rows.filter((row) => row.status === "enabled" || row.status === "ok").length;
  const disabled = Math.max(0, model.rows.length - enabled);
  return `enabled ${enabled} | inactive ${disabled}`;
}

function HookDetailCard(props: {
  row: HookPanelRow | undefined;
  width: number;
}): React.ReactElement | null {
  if (!props.row) return null;
  const commandWidth = Math.max(18, props.width - 18);
  const noteWidth = Math.max(18, props.width - 18);
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        <StatusBadge label={props.row.status} tone={props.row.tone} />
        <Text> </Text>
        <Text color="cyan">{truncateCells(props.row.id, 24)}</Text>
        <Text color="gray"> {truncateCells(`${props.row.event} / ${props.row.matcher}`, Math.max(18, props.width - 34))}</Text>
      </Box>
      <Box paddingLeft={2}>
        <Text color="gray">{truncateCells(props.row.command, commandWidth)}</Text>
      </Box>
      {props.row.note ? (
        <Box paddingLeft={2}>
          <Text color="gray">{truncateCells(props.row.note, noteWidth)}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

function hookEventDescription(summary: HookPanelEventSummary): string {
  const base = HOOK_EVENT_DESCRIPTIONS[summary.event] ?? "custom hook event";
  if (summary.hooks === 0) return base;
  return `${base}; enabled ${summary.enabled}, inactive ${summary.disabled}`;
}

function eventSummaryTone(hooks: number, inactive: number): TerminalTone {
  if (hooks === 0) return "muted";
  if (inactive > 0) return "warning";
  return "brand";
}
