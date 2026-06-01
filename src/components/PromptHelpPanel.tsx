import React from "react";
import { Box, Text } from "ink";
import { Pane } from "./design/Pane.js";
import { padRightCells, truncateCells } from "./design/textLayout.js";

export interface PromptHelpRow {
  key: string;
  action: string;
}

export interface PromptHelpSection {
  title: string;
  rows: PromptHelpRow[];
}

export function PromptHelpPanel(props: {
  width: number;
  busy: boolean;
}): React.ReactElement {
  const width = Math.max(46, Math.min(props.width - 2, 104));
  const sections = buildPromptHelpSections(props.busy);
  const columnWidth = width >= 92 ? Math.floor((width - 4) / 2) : width - 4;
  const columns = width >= 92 ? splitPromptHelpColumns(sections) : [sections];

  return (
    <Box paddingX={1} paddingBottom={1}>
      <Pane title="Shortcuts" tone="brand" width={width}>
        <Box flexDirection={columns.length > 1 ? "row" : "column"}>
          {columns.map((column, columnIndex) => (
            <Box
              key={`column-${columnIndex}`}
              flexDirection="column"
              marginRight={columnIndex === 0 && columns.length > 1 ? 2 : 0}
              width={columnWidth}
            >
              {column.map((section) => (
                <Box key={section.title} flexDirection="column" marginBottom={1}>
                  <Text color="cyan">{section.title}</Text>
                  {section.rows.map((row) => (
                    <Text key={`${section.title}:${row.key}`} color="gray">
                      <Text color="white">{padRightCells(row.key, 18)}</Text>
                      {truncateCells(row.action, Math.max(12, columnWidth - 18))}
                    </Text>
                  ))}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
        <Text color="gray">Press Esc or ? to close.</Text>
      </Pane>
    </Box>
  );
}

export function buildPromptHelpSections(busy: boolean): PromptHelpSection[] {
  return [
    {
      title: "Navigate",
      rows: [
        { key: "Ctrl+P", action: "open command palette" },
        { key: "Ctrl+O", action: "quick open files, Enter adds @file" },
        { key: "Ctrl+R", action: "search prompt history" },
        { key: "?", action: "show or hide this shortcut panel" },
      ],
    },
    {
      title: "Edit",
      rows: [
        { key: "Tab", action: "complete selected slash command" },
        { key: "Shift+Enter", action: "insert newline" },
        { key: "Ctrl+A / Ctrl+E", action: "move to start or end" },
        { key: "Ctrl+U / Ctrl+K", action: "clear before or after cursor" },
        { key: "Ctrl+W", action: "delete word before cursor" },
        { key: "Esc Esc", action: "clear current input after confirm" },
      ],
    },
    {
      title: "Run",
      rows: [
        { key: "Enter", action: busy ? "queue next prompt while working" : "send prompt" },
        { key: "/cancel", action: "cancel or inspect a running task" },
        { key: "/status", action: "show project, provider, cache, gates" },
        { key: "/queue", action: "inspect durable task queue" },
      ],
    },
    {
      title: "DeepSeek",
      rows: [
        { key: "/model", action: "open model selector; Up/Down and Enter switch" },
        { key: "/cache plan", action: "preview cache-safe prompt blocks" },
        { key: "/cache doctor", action: "diagnose cache hit rate and drift" },
        { key: "/permissions", action: "change shell/browser profile" },
      ],
    },
  ];
}

export function splitPromptHelpColumns(sections: PromptHelpSection[]): PromptHelpSection[][] {
  const midpoint = Math.ceil(sections.length / 2);
  return [sections.slice(0, midpoint), sections.slice(midpoint)];
}
