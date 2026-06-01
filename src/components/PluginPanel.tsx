import React from "react";
import { Box, Text } from "ink";
import type { LoadedPlugin } from "../plugins/loader.js";
import type { PluginValidationResult } from "../plugins/manifest.js";
import type { PluginSummary } from "../plugins/registry.js";
import type { PluginSearchResult } from "../services/plugins/pluginService.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";
import { ValidationErrorsList, type ValidationListError } from "./ValidationErrorsList.js";

export interface PluginPanelModel {
  title: string;
  subtitle: string;
  rows: PluginPanelRow[];
  preview?: string[];
  validationErrors?: ValidationListError[];
  footer: string;
}

export interface PluginPanelRow {
  key: string;
  name: string;
  status: string;
  tone: TerminalTone;
  detail: string;
  note: string;
}

export function PluginPanel(props: {
  model: PluginPanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(52, Math.min(112, columns - 4));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="plugins" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={`${props.model.rows.length}`} tone={props.model.rows.length > 0 ? "brand" : "muted"} />
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {props.model.rows.length === 0 ? (
            <Text color="gray">No plugins discovered</Text>
          ) : props.model.rows.map((row) => (
            <PluginPanelRowView key={row.key} row={row} width={width} />
          ))}
        </Box>
        {props.model.preview && props.model.preview.length > 0 ? (
          <Box flexDirection="column" marginBottom={1}>
            <Text color="gray">plugin components</Text>
            {props.model.preview.map((line, index) => (
              <Text key={`${index}-${line}`} color="gray">{truncateCells(`  ${line}`, Math.max(24, width - 4))}</Text>
            ))}
          </Box>
        ) : null}
        <ValidationErrorsList errors={props.model.validationErrors ?? []} width={width - 2} />
        <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
      </Pane>
    </Box>
  );
}

export function pluginListPanelModel(plugins: Array<LoadedPlugin | PluginSummary>): PluginPanelModel {
  return {
    title: "Plugins",
    subtitle: `${plugins.length} discovered plugin${plugins.length === 1 ? "" : "s"}`,
    rows: plugins.map((plugin) => pluginRow(plugin)),
    footer: "/plugins show <name> | /plugins enable <name> | /plugins validate [name]",
  };
}

export function pluginSearchPanelModel(plugins: PluginSearchResult[], query: string): PluginPanelModel {
  return {
    title: "Plugin search",
    subtitle: query ? `query: ${query}` : "all plugins",
    rows: plugins.map((plugin) => ({
      key: `${plugin.scope}/${plugin.name}`,
      name: `${plugin.scope}/${plugin.name}`,
      status: plugin.enabled ? "enabled" : "disabled",
      tone: plugin.enabled ? toneForScope(plugin.scope) : "muted",
      detail: plugin.description || "(no description)",
      note: [
        plugin.commands.length ? `commands=${plugin.commands.map((command) => `/${plugin.name}:${command}`).join(",")}` : "commands=none",
        plugin.source ? `source=${plugin.source.kind}:${plugin.source.sourcePath}` : plugin.path,
      ].join(" "),
    })),
    footer: "/plugins show <name> | /plugins install <path> [name]",
  };
}

export function pluginDetailPanelModel(plugin: LoadedPlugin): PluginPanelModel {
  return {
    title: `Plugin: ${plugin.name}`,
    subtitle: `${plugin.scope} / ${plugin.path}`,
    rows: [pluginRow(plugin)],
    preview: pluginComponentPreview(plugin),
    footer: `/plugins ${plugin.enabled ? "disable" : "enable"} ${plugin.name} | /plugins validate ${plugin.name}`,
  };
}

export function pluginValidationPanelModel(results: PluginValidationResult[]): PluginPanelModel {
  return {
    title: "Plugin validation",
    subtitle: `${results.length} validation result${results.length === 1 ? "" : "s"}`,
    rows: results.map((result) => ({
      key: result.name,
      name: result.name,
      status: result.ok ? "ok" : "failed",
      tone: result.ok ? "success" : "error",
      detail: result.path || "(missing)",
      note: [
        ...result.errors.map((error) => `error: ${error}`),
        ...result.warnings.map((warning) => `warning: ${warning}`),
      ].join("; "),
    })),
    validationErrors: results.flatMap((result) => [
      ...result.errors.map((error) => ({
        file: result.path || result.name,
        path: result.name,
        message: error,
        severity: "error" as const,
      })),
      ...result.warnings.map((warning) => ({
        file: result.path || result.name,
        path: result.name,
        message: warning,
        severity: "warning" as const,
      })),
    ]),
    footer: "/plugins list | /plugins show <name>",
  };
}

function PluginPanelRowView(props: {
  row: PluginPanelRow;
  width: number;
}): React.ReactElement {
  const detailWidth = Math.max(20, props.width - 38);
  const noteWidth = Math.max(20, props.width - 12);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row">
        <StatusBadge label={props.row.status} tone={props.row.tone} />
        <Text> </Text>
        <Text color="cyan">{truncateCells(props.row.name.padEnd(20), 20)}</Text>
        <Text color="gray">{truncateCells(props.row.detail, detailWidth)}</Text>
      </Box>
      {props.row.note ? (
        <Box flexDirection="row">
          <Text color="gray">  </Text>
          <Text color="gray">{truncateCells(props.row.note, noteWidth)}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

function pluginRow(plugin: LoadedPlugin | PluginSummary): PluginPanelRow {
  const loaded = "manifest" in plugin || "manifestError" in plugin ? plugin as LoadedPlugin : undefined;
  const manifest = loaded?.manifest;
  const status = loaded?.manifestError ? "invalid" : plugin.enabled ? "enabled" : "disabled";
  return {
    key: `${plugin.scope}/${plugin.name}`,
    name: `${plugin.scope}/${plugin.name}`,
    status,
    tone: loaded?.manifestError ? "error" : plugin.enabled ? toneForScope(plugin.scope) : "muted",
    detail: loaded?.manifestError ?? manifest?.description ?? "(manifest not loaded)",
    note: [
    manifest?.commands.length ? `commands=${manifest.commands.map((command) => `/${manifest.name}:${command.name}`).join(",")}` : "commands=none",
    componentCounts(loaded),
      plugin.path,
    ].filter(Boolean).join(" "),
  };
}

function toneForScope(scope: PluginSummary["scope"]): TerminalTone {
  if (scope === "project") return "success";
  if (scope === "user") return "brand";
  return "muted";
}

function componentCounts(plugin: LoadedPlugin | undefined): string {
  const manifest = plugin?.manifest;
  if (!manifest) return "";
  return [
    manifest.agents.length ? `agents=${manifest.agents.length}` : "",
    manifest.skills.length ? `skills=${manifest.skills.length}` : "",
    manifest.output_styles.length ? `styles=${manifest.output_styles.length}` : "",
    manifest.hooks.length ? `hooks=${manifest.hooks.length}` : "",
  ].filter(Boolean).join(" ");
}

function pluginComponentPreview(plugin: LoadedPlugin): string[] {
  const manifest = plugin.manifest;
  if (plugin.manifestError) return [`manifest error: ${plugin.manifestError}`];
  if (!manifest) return ["manifest missing"];
  return [
    `description: ${manifest.description || "(none)"}`,
    `commands: ${manifest.commands.length ? manifest.commands.map((command) => `/${manifest.name}:${command.name}`).join(", ") : "none"}`,
    `agents: ${manifest.agents.length ? manifest.agents.join(", ") : "none"}`,
    `skills: ${manifest.skills.length ? manifest.skills.join(", ") : "none"}`,
    `output styles: ${manifest.output_styles.length ? manifest.output_styles.join(", ") : "none"}`,
    `hooks: ${manifest.hooks.length ? manifest.hooks.map((hook) => `${hook.event}:${hook.id}`).join(", ") : "none"}`,
  ];
}
