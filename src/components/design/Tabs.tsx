import React from "react";
import { Box, Text } from "ink";
import { truncateCells } from "./textLayout.js";
import { toneColor, type TerminalTone } from "./terminalTheme.js";

export interface TabItem {
  id: string;
  title: string;
  count?: number;
  tone?: TerminalTone;
  disabled?: boolean;
}

export interface TabStripPart {
  id: string;
  label: string;
  selected: boolean;
  disabled: boolean;
  tone: TerminalTone;
}

export function resolveSelectedTabId(tabs: TabItem[], selectedId: string | undefined): string | undefined {
  if (tabs.length === 0) return undefined;
  if (selectedId && tabs.some((tab) => tab.id === selectedId && !tab.disabled)) return selectedId;
  return tabs.find((tab) => !tab.disabled)?.id ?? tabs[0]?.id;
}

export function buildTabStripParts(tabs: TabItem[], selectedId: string | undefined): TabStripPart[] {
  const selected = resolveSelectedTabId(tabs, selectedId);
  return tabs.map((tab) => {
    const label = tab.count === undefined ? tab.title : `${tab.title} ${tab.count}`;
    return {
      id: tab.id,
      label,
      selected: tab.id === selected,
      disabled: tab.disabled ?? false,
      tone: tab.disabled ? "muted" : tab.tone ?? (tab.id === selected ? "brand" : "muted"),
    };
  });
}

export function Tabs(props: {
  tabs: TabItem[];
  selectedId?: string;
  title?: string;
  tone?: TerminalTone;
  width?: number;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  hidden?: boolean;
}): React.ReactElement | null {
  if (props.hidden) return null;
  const parts = buildTabStripParts(props.tabs, props.selectedId);
  const width = props.width ?? 96;
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        {props.title ? <Text bold color={toneColor(props.tone ?? "brand")}>{truncateCells(props.title, 18)} </Text> : null}
        {parts.map((part) => (
          <Text
            key={part.id}
            bold={part.selected}
            color={toneColor(part.tone)}
            inverse={part.selected}
            dimColor={part.disabled}
          >
            {` ${truncateCells(part.label, Math.max(4, Math.min(24, width - 8)))} `}
          </Text>
        ))}
      </Box>
      {props.children ? <Box flexDirection="column" marginTop={1}>{props.children}</Box> : null}
      {props.footer ? <Box marginTop={1}><Text color="gray">{props.footer}</Text></Box> : null}
    </Box>
  );
}
