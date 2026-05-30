import React from "react";
import { Box, Text } from "ink";
import {
  getHistorySearchItems,
  type HistorySearchItem,
} from "../prompt/historySearch.js";
import { FuzzyPicker } from "./design/FuzzyPicker.js";
import { flattenCellText, padRightCells, truncateCells } from "./design/textLayout.js";

export function HistorySearchPanel(props: {
  entries: string[];
  query: string;
  selectedIndex: number;
  width: number;
}): React.ReactElement {
  const items = getHistorySearchItems(props.entries, props.query, 9);
  return (
    <FuzzyPicker
      title="Search Prompts"
      query={props.query}
      placeholder="Filter history"
      items={items}
      selectedIndex={props.selectedIndex}
      width={props.width}
      emptyMessage={props.entries.length === 0 ? "No prompt history yet" : "No matching prompts"}
      footer="Enter use  Esc close  Up/Down select  Ctrl+U clear"
      tone="brand"
      getKey={(item) => item.id}
      renderItem={renderHistoryRow}
      renderPreview={renderHistoryPreview}
    />
  );
}

function renderHistoryRow(item: HistorySearchItem, selected: boolean): React.ReactNode {
  return (
    <Text color={selected ? "white" : "gray"}>
      <Text color={selected ? "cyan" : "gray"}>{padRightCells(item.ageLabel, 8)}</Text>
      {truncateCells(flattenCellText(item.firstLine), 84)}
    </Text>
  );
}

function renderHistoryPreview(item: HistorySearchItem): React.ReactNode {
  const lines = item.text.split(/\r?\n/);
  const visible = lines.slice(0, 6);
  const more = Math.max(0, lines.length - visible.length);
  return (
    <Box flexDirection="column">
      <Text color="gray">
        match <Text color="white">{item.match}</Text>
        {"  "}
        lines <Text color="white">{String(item.lineCount)}</Text>
      </Text>
      {visible.map((line, index) => (
        <Text key={`${index}:${line}`} color="gray">
          {truncateCells(flattenCellText(line), 96)}
        </Text>
      ))}
      {more > 0 && <Text color="gray">{`... +${more} more lines`}</Text>}
    </Box>
  );
}
