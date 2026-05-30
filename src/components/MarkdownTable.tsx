import React from "react";
import { Box, Text } from "ink";
import { padRightCells, truncateCells } from "./design/textLayout.js";

export interface MarkdownTableModel {
  headers: string[];
  rows: string[][];
  widths: number[];
}

export interface ParsedMarkdownTable {
  model: MarkdownTableModel;
  endIndex: number;
}

export function MarkdownTable(props: {
  model: MarkdownTableModel;
  width: number;
}): React.ReactElement {
  const lines = renderMarkdownTableLines(props.model, props.width);
  return (
    <Box flexDirection="column" marginY={1}>
      {lines.map((line, index) => (
        <Text key={`${index}:${line}`} color={index <= 2 ? "cyan" : "gray"}>
          {line}
        </Text>
      ))}
    </Box>
  );
}

export function parseMarkdownTableBlock(lines: string[], startIndex: number, width: number): ParsedMarkdownTable | null {
  const header = lines[startIndex];
  const separator = lines[startIndex + 1];
  if (!header || !separator || !isTableRow(header) || !isTableSeparator(separator)) return null;

  const headers = splitTableRow(header);
  const rows: string[][] = [];
  let index = startIndex + 2;
  while (index < lines.length && isTableRow(lines[index] ?? "")) {
    rows.push(splitTableRow(lines[index] ?? ""));
    index += 1;
  }
  if (headers.length === 0 || rows.length === 0) return null;
  return {
    model: markdownTableModel(headers, rows, width),
    endIndex: index - 1,
  };
}

export function markdownTableModel(headers: string[], rows: string[][], width: number): MarkdownTableModel {
  const columnCount = Math.max(headers.length, ...rows.map((row) => row.length));
  const rawWidths = Array.from({ length: columnCount }, (_, column) => {
    const values = [headers[column] ?? "", ...rows.map((row) => row[column] ?? "")];
    return Math.max(3, ...values.map((value) => value.length));
  });
  const available = Math.max(12, width - (columnCount * 3) - 1);
  const total = rawWidths.reduce((sum, value) => sum + value, 0);
  const widths = total <= available
    ? rawWidths
    : rawWidths.map((value) => Math.max(3, Math.floor((value / total) * available)));
  return { headers, rows, widths };
}

export function renderMarkdownTableLines(model: MarkdownTableModel, width: number): string[] {
  const border = tableBorder(model.widths);
  const lines = [
    border,
    tableRow(model.headers, model.widths),
    border,
    ...model.rows.map((row) => tableRow(row, model.widths)),
    border,
  ];
  return lines.map((line) => truncateCells(line, width));
}

function tableBorder(widths: number[]): string {
  return `+${widths.map((width) => "-".repeat(width + 2)).join("+")}+`;
}

function tableRow(values: string[], widths: number[]): string {
  return `|${widths.map((width, index) => {
    const value = truncateCells(values[index] ?? "", width);
    return ` ${padRightCells(value, width)} `;
  }).join("|")}|`;
}

function isTableRow(line: string): boolean {
  return line.includes("|") && splitTableRow(line).length >= 2;
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}
