import React from "react";
import { Box, Text } from "ink";
import { toneColor, type TerminalTone } from "./terminalTheme.js";

export interface ListItemModel {
  indicator: string;
  marker: string;
  tone: TerminalTone;
  dim: boolean;
}

export function buildListItemModel(props: {
  focused: boolean;
  selected?: boolean;
  disabled?: boolean;
  showScrollDown?: boolean;
  showScrollUp?: boolean;
}): ListItemModel {
  if (props.disabled) {
    return { indicator: " ", marker: "   ", tone: "muted", dim: true };
  }
  const indicator = props.focused ? ">" : props.showScrollDown ? "v" : props.showScrollUp ? "^" : " ";
  const marker = props.selected ? "[x]" : "   ";
  const tone = props.selected ? "success" : props.focused ? "brand" : "default";
  return { indicator, marker, tone, dim: false };
}

export function ListItem(props: {
  focused: boolean;
  selected?: boolean;
  disabled?: boolean;
  showScrollDown?: boolean;
  showScrollUp?: boolean;
  description?: string;
  children: React.ReactNode;
}): React.ReactElement {
  const model = buildListItemModel(props);
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text color={toneColor(model.tone)} dimColor={model.dim}>{model.indicator}</Text>
        <Text> </Text>
        <Text color={toneColor(model.tone)} dimColor={model.dim}>
          {props.children}
        </Text>
        <Text color={toneColor(props.selected && !props.disabled ? "success" : "muted")}>
          {` ${model.marker}`}
        </Text>
      </Box>
      {props.description && (
        <Box paddingLeft={2}>
          <Text color="gray">{props.description}</Text>
        </Box>
      )}
    </Box>
  );
}
