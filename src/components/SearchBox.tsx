import React from "react";
import { Box, Text } from "ink";
import { toneColor } from "./design/terminalTheme.js";

export interface SearchBoxModel {
  prefix: string;
  query: string;
  placeholder: string;
  beforeCursor: string;
  cursor: string;
  afterCursor: string;
  focused: boolean;
  terminalFocused: boolean;
  showingPlaceholder: boolean;
}

export function SearchBox(props: {
  query: string;
  placeholder?: string;
  isFocused: boolean;
  isTerminalFocused: boolean;
  prefix?: string;
  width?: number;
  cursorOffset?: number;
  borderless?: boolean;
}): React.ReactElement {
  const model = searchBoxModel(props);
  return (
    <Box
      flexShrink={0}
      borderStyle={props.borderless ? undefined : "round"}
      borderColor={props.isFocused ? toneColor("brand") : undefined}
      borderDimColor={!props.isFocused}
      paddingX={props.borderless ? 0 : 1}
      width={props.width}
    >
      <Text dimColor={!model.focused}>{model.prefix} </Text>
      {model.focused && model.terminalFocused ? (
        <>
          <Text dimColor={model.showingPlaceholder}>{model.beforeCursor}</Text>
          <Text inverse>{model.cursor}</Text>
          <Text dimColor={model.showingPlaceholder}>{model.afterCursor}</Text>
        </>
      ) : (
        <Text dimColor={model.showingPlaceholder && model.focused}>
          {model.query || model.placeholder}
        </Text>
      )}
    </Box>
  );
}

export function searchBoxModel(props: {
  query: string;
  placeholder?: string;
  isFocused: boolean;
  isTerminalFocused: boolean;
  prefix?: string;
  cursorOffset?: number;
}): SearchBoxModel {
  const placeholder = props.placeholder ?? "Search...";
  const prefix = props.prefix ?? "/";
  const query = props.query;
  const offset = clampCursorOffset(props.cursorOffset ?? query.length, query);
  const showingPlaceholder = query.length === 0;
  const text = showingPlaceholder ? placeholder : query;
  const cursorOffset = showingPlaceholder ? 0 : offset;
  return {
    prefix,
    query,
    placeholder,
    beforeCursor: text.slice(0, cursorOffset),
    cursor: text[cursorOffset] ?? " ",
    afterCursor: text.slice(cursorOffset + 1),
    focused: props.isFocused,
    terminalFocused: props.isTerminalFocused,
    showingPlaceholder,
  };
}

function clampCursorOffset(value: number, text: string): number {
  if (!Number.isFinite(value)) return text.length;
  return Math.max(0, Math.min(text.length, Math.trunc(value)));
}
