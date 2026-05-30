import React from "react";
import { Box, Text } from "ink";
import type { SlashCommandSuggestion } from "../prompt/commandSuggestions.js";
import {
  flattenCellText,
  padRightCells,
  truncateCells,
} from "./design/textLayout.js";

export interface VisibleSuggestionRow {
  suggestion: SlashCommandSuggestion;
  index: number;
}

export function CommandSuggestions(props: {
  suggestions: SlashCommandSuggestion[];
  selectedIndex: number;
  width: number;
}): React.ReactElement | null {
  if (props.suggestions.length === 0) return null;
  const nameWidth = props.width >= 96 ? 28 : 22;
  const descriptionWidth = Math.max(20, props.width - nameWidth - 8);
  const rows = visibleSuggestionRows(props.suggestions, props.selectedIndex, props.width >= 72 ? 5 : 4);
  return (
    <Box flexDirection="column" paddingX={1} paddingBottom={1}>
      {rows.map(({ suggestion, index }) => {
        const selected = index === props.selectedIndex;
        return (
          <Box key={suggestion.id}>
            <Text color={selected ? "cyan" : "gray"} inverse={selected}>{selected ? ">" : " "}</Text>
            <Text color={selected ? "cyan" : "gray"}>{` ${padRightCells(formatName(suggestion), nameWidth)}`}</Text>
            <Text color={selected ? "white" : "gray"}>
              {truncateCells(flattenCellText(suggestion.description), descriptionWidth)}
            </Text>
          </Box>
        );
      })}
      <Text color="gray">  Tab complete  Up/Down select</Text>
    </Box>
  );
}

export function visibleSuggestionRows(
  suggestions: SlashCommandSuggestion[],
  selectedIndex: number,
  maxRows: number,
): VisibleSuggestionRow[] {
  const limit = Math.max(1, maxRows);
  if (suggestions.length <= limit) {
    return suggestions.map((suggestion, index) => ({ suggestion, index }));
  }
  const safeSelected = Math.max(0, Math.min(suggestions.length - 1, selectedIndex));
  const start = Math.max(
    0,
    Math.min(safeSelected - Math.floor(limit / 2), suggestions.length - limit),
  );
  return suggestions
    .slice(start, start + limit)
    .map((suggestion, offset) => ({ suggestion, index: start + offset }));
}

function formatName(suggestion: SlashCommandSuggestion): string {
  const usage = suggestion.usage ? ` ${suggestion.usage}` : "";
  return `/${suggestion.name}${usage}`;
}

export { padRightCells, truncateCells } from "./design/textLayout.js";
