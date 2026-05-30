import React from "react";
import { Box, Text } from "ink";
import { padRightCells, truncateCells } from "./textLayout.js";
import { toneColor, type TerminalTone } from "./terminalTheme.js";

export interface SelectListOption {
  id: string;
  label: string;
  detail?: string;
  description?: string;
  selected?: boolean;
  disabled?: boolean;
  tone?: TerminalTone;
}

export interface SelectListRow {
  id: string;
  label: string;
  detail: string;
  description: string;
  indexLabel: string;
  indicator: string;
  marker: string;
  focused: boolean;
  disabled: boolean;
  tone: TerminalTone;
}

export function clampSelectIndex(options: SelectListOption[], selectedIndex: number | undefined): number {
  if (options.length === 0) return -1;
  const requested = selectedIndex ?? options.findIndex((option) => option.selected);
  const fallback = options.findIndex((option) => !option.disabled);
  const clamped = requested < 0 ? fallback : Math.min(options.length - 1, requested);
  if (clamped < 0) return 0;
  if (!options[clamped]?.disabled) return clamped;
  return fallback >= 0 ? fallback : clamped;
}

export function selectListWindow(input: {
  count: number;
  selectedIndex: number;
  visibleCount: number;
}): { start: number; end: number } {
  const count = Math.max(0, input.count);
  const visible = Math.max(1, input.visibleCount);
  if (count <= visible) return { start: 0, end: count };
  const half = Math.floor(visible / 2);
  const start = Math.max(0, Math.min(input.selectedIndex - half, count - visible));
  return { start, end: start + visible };
}

export function buildSelectListRows(input: {
  options: SelectListOption[];
  selectedIndex?: number;
  visibleCount?: number;
  hideIndexes?: boolean;
}): SelectListRow[] {
  const selectedIndex = clampSelectIndex(input.options, input.selectedIndex);
  const window = selectListWindow({
    count: input.options.length,
    selectedIndex,
    visibleCount: input.visibleCount ?? 6,
  });
  const maxIndexWidth = String(input.options.length).length;
  return input.options.slice(window.start, window.end).map((option, offset) => {
    const absoluteIndex = window.start + offset;
    const focused = absoluteIndex === selectedIndex;
    const selected = option.selected ?? focused;
    const hasMoreAbove = window.start > 0 && offset === 0;
    const hasMoreBelow = window.end < input.options.length && offset === window.end - window.start - 1;
    return {
      id: option.id,
      label: option.label,
      detail: option.detail ?? "",
      description: option.description ?? "",
      indexLabel: input.hideIndexes ? "" : `${absoluteIndex + 1}.`.padEnd(maxIndexWidth + 1),
      indicator: focused ? ">" : hasMoreAbove ? "^" : hasMoreBelow ? "v" : " ",
      marker: selected ? "[x]" : "   ",
      focused,
      disabled: option.disabled ?? false,
      tone: option.disabled ? "muted" : option.tone ?? (focused ? "brand" : "default"),
    };
  });
}

export function SelectList(props: {
  options: SelectListOption[];
  selectedIndex?: number;
  visibleCount?: number;
  hideIndexes?: boolean;
  width?: number;
}): React.ReactElement {
  const rows = buildSelectListRows(props);
  const width = props.width ?? 96;
  const labelWidth = Math.max(12, Math.min(28, Math.floor(width * 0.28)));
  const detailWidth = Math.max(18, width - labelWidth - 12);
  if (rows.length === 0) {
    return <Text color="gray">No options</Text>;
  }
  return (
    <Box flexDirection="column">
      {rows.map((row) => (
        <Box key={row.id} flexDirection="column">
          <Box flexDirection="row">
            <Text color={toneColor(row.tone)} inverse={row.focused} dimColor={row.disabled}>{row.indicator}</Text>
            <Text color="gray"> {row.indexLabel}</Text>
            <Text color={toneColor(row.tone)} dimColor={row.disabled}>{padRightCells(row.label, labelWidth)}</Text>
            <Text color={toneColor(row.focused ? "success" : "muted")} dimColor={row.disabled}>{` ${row.marker} `}</Text>
            <Text color="gray">{truncateCells(row.detail, detailWidth)}</Text>
          </Box>
          {row.description ? (
            <Box paddingLeft={4}>
              <Text color="gray">{truncateCells(row.description, Math.max(18, width - 6))}</Text>
            </Box>
          ) : null}
        </Box>
      ))}
    </Box>
  );
}
