import React from "react";
import { Box, Text } from "ink";
import type { TerminalThemeDefinition } from "../services/theme/themeCatalog.js";
import type { ThemeSettings } from "../services/theme/themeService.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { Tabs } from "./design/Tabs.js";
import { truncateCells } from "./design/textLayout.js";
import { toneColor, type TerminalTone } from "./design/terminalTheme.js";
import { ThemePicker, themePickerModel, type ThemePickerModel } from "./ThemePicker.js";

export interface ThemePanelModel {
  title: string;
  subtitle: string;
  badge: string;
  badgeTone: TerminalTone;
  rows: ThemePanelRow[];
  picker?: ThemePickerModel;
  footer: string;
}

export interface ThemePanelRow {
  key: string;
  name: string;
  status: string;
  tone: TerminalTone;
  swatches: Array<{ tone: TerminalTone; color?: string }>;
  detail: string;
  note: string;
}

export function ThemePanel(props: {
  model: ThemePanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(58, Math.min(112, columns - 4));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="theme" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color={toneColor("brand")}>{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={props.model.badge} tone={props.model.badgeTone} />
        </Box>
        <Box marginTop={1}>
          <Tabs
            title="view"
            selectedId={props.model.rows.length > 1 ? "themes" : "settings"}
            tabs={[
              { id: "themes", title: "themes", count: props.model.rows.length, tone: "brand" },
              { id: "settings", title: "settings", tone: "muted" },
            ]}
            width={width}
          />
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {props.model.rows.map((row) => (
            <ThemePanelRowView key={row.key} row={row} width={width} />
          ))}
        </Box>
        {props.model.picker ? (
          <ThemePicker model={props.model.picker} width={width - 2} />
        ) : null}
        <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
      </Pane>
    </Box>
  );
}

export function themeListPanelModel(input: {
  themes: TerminalThemeDefinition[];
  current: ThemeSettings;
}): ThemePanelModel {
  return {
    title: "Themes",
    subtitle: `current=${input.current.theme} source=${input.current.source}`,
    badge: input.current.theme,
    badgeTone: "brand",
    rows: input.themes.map((theme) => themeRow(theme, theme.name === input.current.theme ? "current" : "available")),
    picker: themePickerModel(input),
    footer: "/theme set <name> | /theme current | /theme reset",
  };
}

export function themeCurrentPanelModel(settings: ThemeSettings, action: "current" | "set" | "reset" | "path"): ThemePanelModel {
  return {
    title: action === "set" ? "Theme set" : action === "reset" ? "Theme reset" : action === "path" ? "Theme path" : "Current theme",
    subtitle: `${settings.definition.label} | source=${settings.source}`,
    badge: settings.theme,
    badgeTone: "brand",
    rows: [
      themeRow(settings.definition, action === "path" ? "path" : settings.source),
      {
        key: "path",
        name: "config",
        status: "path",
        tone: "muted",
        swatches: [],
        detail: settings.path,
        note: "Project theme file; DEEPSEEKCODE_THEME overrides it for the current process.",
      },
    ],
    footer: "/theme list | /theme set <name> | /config",
  };
}

function ThemePanelRowView(props: {
  row: ThemePanelRow;
  width: number;
}): React.ReactElement {
  const detailWidth = Math.max(24, props.width - 46);
  const noteWidth = Math.max(24, props.width - 12);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row">
        <StatusBadge label={props.row.status} tone={props.row.tone} />
        <Text> </Text>
        <Text color={toneColor("brand")}>{truncateCells(props.row.name.padEnd(18), 18)}</Text>
        <Swatches swatches={props.row.swatches} />
        <Text color="gray"> </Text>
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

function Swatches(props: {
  swatches: Array<{ tone: TerminalTone; color?: string }>;
}): React.ReactElement {
  if (props.swatches.length === 0) return <Text color="gray">      </Text>;
  return (
    <Box flexDirection="row">
      {props.swatches.map((swatch) => (
        <Text key={swatch.tone} color={swatch.color}>{` ${swatch.tone[0] ?? "?"}`}</Text>
      ))}
    </Box>
  );
}

function themeRow(theme: TerminalThemeDefinition, status: string): ThemePanelRow {
  return {
    key: theme.name,
    name: theme.name,
    status,
    tone: status === "current" || status === "project" || status === "env" || status === "set" ? "success" : "muted",
    swatches: (["brand", "success", "warning", "error"] as TerminalTone[]).map((tone) => ({
      tone,
      color: theme.colors[tone],
    })),
    detail: theme.label,
    note: theme.description,
  };
}
