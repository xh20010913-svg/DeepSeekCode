import React from "react";
import { Box, Text } from "ink";
import type { TerminalThemeDefinition } from "../services/theme/themeCatalog.js";
import type { ThemeSettings } from "../services/theme/themeService.js";
import { SelectList, type SelectListOption } from "./design/SelectList.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import { toneColor, type TerminalTone } from "./design/terminalTheme.js";

export interface ThemePickerModel {
  title: string;
  subtitle: string;
  options: ThemePickerOption[];
  selectedIndex: number;
  preview: string;
  footer: string;
}

export interface ThemePickerOption {
  id: string;
  label: string;
  status: string;
  tone: TerminalTone;
  detail: string;
  description: string;
  selected: boolean;
}

export function ThemePicker(props: {
  model: ThemePickerModel;
  width?: number;
}): React.ReactElement {
  const width = props.width ?? 96;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        <Text color="gray">{props.model.title} </Text>
        <StatusBadge label={`${props.model.options.length}`} tone="brand" />
        <Text color="gray"> {truncateCells(props.model.subtitle, Math.max(16, width - 24))}</Text>
      </Box>
      <SelectList
        options={props.model.options.map(themePickerSelectOption)}
        selectedIndex={props.model.selectedIndex}
        visibleCount={6}
        width={width}
      />
      <Box flexDirection="row">
        <Text color="gray">preview </Text>
        <Text color={toneColor("brand")}>{truncateCells(props.model.preview, Math.max(12, width - 12))}</Text>
      </Box>
      <Text color="gray">{truncateCells(props.model.footer, Math.max(18, width - 4))}</Text>
    </Box>
  );
}

export function themePickerModel(input: {
  themes: TerminalThemeDefinition[];
  current: ThemeSettings;
}): ThemePickerModel {
  const options = input.themes.map((theme): ThemePickerOption => ({
    id: theme.name,
    label: theme.label,
    status: theme.name === input.current.theme ? "current" : "available",
    tone: theme.name === input.current.theme ? "success" : themeTone(theme.name),
    detail: theme.name,
    description: theme.description,
    selected: theme.name === input.current.theme,
  }));
  return {
    title: "theme picker",
    subtitle: `source ${input.current.source}; current ${input.current.definition.label}`,
    options,
    selectedIndex: Math.max(0, options.findIndex((option) => option.selected)),
    preview: "DeepSeekCode > /cache plan <goal> | safe shell off | cache reuse first",
    footer: "/theme set <name> applies a project theme; DEEPSEEKCODE_THEME overrides per process",
  };
}

function themePickerSelectOption(option: ThemePickerOption): SelectListOption {
  return {
    id: option.id,
    label: option.label,
    detail: `${option.status} | ${option.detail}`,
    description: option.description,
    selected: option.selected,
    tone: option.tone,
  };
}

function themeTone(name: string): TerminalTone {
  if (name.includes("cache")) return "success";
  if (name.includes("contrast")) return "warning";
  if (name.includes("claude")) return "brand";
  return "muted";
}
