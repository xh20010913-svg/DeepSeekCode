import React from "react";
import { Box, Text } from "ink";
import { ValidationResultBlock } from "./ValidationResultBlock.js";

export interface FileToolResultSummary {
  metricLabel: string;
  metricValue: string;
  lines: string[];
}

const FILE_ACTIONS = new Set([
  "apply_patch",
  "browser_screenshot",
  "glob_files",
  "grep_files",
  "list_files",
  "read_file",
  "ssh_read_file",
  "ssh_write_file",
  "validate_artifact",
  "write_file",
]);

const MAX_DETAIL_LINES = 80;
const MAX_DETAIL_LINE_CHARS = 240;

export function FileToolResultBlock(props: {
  action: string;
  message: string;
}): React.ReactElement | null {
  if (props.action === "validate_artifact") {
    const validation = <ValidationResultBlock message={props.message} />;
    if (validation) return validation;
  }

  const summary = parseFileToolResultMessage(props.action, props.message);
  if (!summary) return null;

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text color="gray">{summary.metricLabel.padEnd(7)} </Text>
        <Text color="gray">{summary.metricValue}</Text>
      </Box>
      {summary.lines.map((line, index) => (
        <Text key={`${index}:${line.slice(0, 24)}`} color="gray">
          {line || " "}
        </Text>
      ))}
    </Box>
  );
}

export function parseFileToolResultMessage(
  action: string,
  message: string,
): FileToolResultSummary | null {
  if (!FILE_ACTIONS.has(action)) return null;
  const trimmed = message.trim();
  if (!trimmed) return null;

  const simple = parseSimpleMetric(trimmed);
  if (simple) return simple;

  if (trimmed === "no matches") {
    return { metricLabel: "matches", metricValue: "0", lines: [] };
  }

  const lines = clipLines(trimmed);
  if (action === "glob_files" || action === "grep_files") {
    return {
      metricLabel: "matches",
      metricValue: String(trimmed.split(/\r?\n/).filter(Boolean).length),
      lines,
    };
  }

  if (action === "validate_artifact") {
    const errors = lines.filter((line) => /\berror\b/i.test(line)).length;
    const warnings = lines.filter((line) => /\bwarning\b/i.test(line)).length;
    return {
      metricLabel: "issues",
      metricValue: `${errors} error / ${warnings} warning`,
      lines,
    };
  }

  return {
    metricLabel: "detail",
    metricValue: `${lines.length} line${lines.length === 1 ? "" : "s"}`,
    lines,
  };
}

function parseSimpleMetric(message: string): FileToolResultSummary | null {
  const match = message.match(/^(\d+)\s+(chars|entries|edits|bytes)(?:\s+.*)?$/i);
  if (!match) return null;
  return {
    metricLabel: match[2].toLowerCase(),
    metricValue: match[1],
    lines: message.includes(" from ") || message.includes(" to ") ? [message] : [],
  };
}

function clipLines(message: string): string[] {
  const lines = message.split(/\r?\n/);
  const clipped = lines.length > MAX_DETAIL_LINES;
  const visible = lines.slice(0, MAX_DETAIL_LINES).map((line) =>
    line.length > MAX_DETAIL_LINE_CHARS
      ? `${line.slice(0, MAX_DETAIL_LINE_CHARS - 3)}...`
      : line,
  );
  if (clipped) visible.push(`... ${lines.length - MAX_DETAIL_LINES} more lines ...`);
  return visible;
}
