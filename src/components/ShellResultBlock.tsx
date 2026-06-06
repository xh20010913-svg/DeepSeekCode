import React from "react";
import { Box, Text } from "ink";
import type { MessageTone } from "./MessageResponse.js";
import { toneColor } from "./design/terminalTheme.js";
import { formatTechnicalErrorForTerminal } from "../utils/technicalErrorSummary.js";

export interface ShellResultSummary {
  exit: string;
  output: string;
  timedOut: boolean;
}

const MAX_OUTPUT_LINES = 18;
const MAX_ERROR_LINES = 10;
const MAX_OUTPUT_LINE_CHARS = 240;

export function ShellResultBlock(props: {
  message: string;
  tone: MessageTone;
}): React.ReactElement | null {
  const summary = parseShellResultMessage(props.message);
  if (!summary) return null;
  const shouldSummarize = props.tone === "error" || summary.timedOut;
  const displayOutput = shouldSummarize
    ? formatTechnicalErrorForTerminal(summary.output || props.message, { maxRawLines: 3 })
    : summary.output;
  const lines = formatShellOutput(displayOutput, shouldSummarize ? MAX_ERROR_LINES : MAX_OUTPUT_LINES);

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text color="gray">{"exit    "}</Text>
        <Text color={summary.timedOut ? "yellow" : toneColor(props.tone) ?? "gray"}>
          {summary.exit}
        </Text>
      </Box>
      {lines.length > 0 ? (
        <Box flexDirection="column">
          <Text color="gray">output</Text>
          {lines.map((line, index) => (
            <Text key={`${index}:${line.slice(0, 24)}`} color={props.tone === "error" ? "red" : "gray"}>
              {line || " "}
            </Text>
          ))}
        </Box>
      ) : (
        <Text color="gray">(No output)</Text>
      )}
    </Box>
  );
}

export function parseShellResultMessage(message: string): ShellResultSummary | null {
  const lines = message.trim().split(/\r?\n/);
  const first = lines[0]?.trim() ?? "";
  if (!/^(exit\s+(?:\d+|unknown)|timed out)$/i.test(first)) return null;

  return {
    exit: first.toLowerCase(),
    output: lines.slice(1).join("\n").trim(),
    timedOut: /^timed out$/i.test(first),
  };
}

export function formatShellOutput(output: string, maxLines = MAX_OUTPUT_LINES): string[] {
  const lines = output.split(/\r?\n/);
  const clipped = lines.length > maxLines;
  const visible = lines.slice(0, maxLines).map((line) =>
    line.length > MAX_OUTPUT_LINE_CHARS
      ? `${line.slice(0, MAX_OUTPUT_LINE_CHARS - 3)}...`
      : line,
  );
  if (clipped) visible.push(`... ${lines.length - maxLines} more output lines ...`);
  return visible.filter((line, index, array) => line.length > 0 || index < array.length - 1);
}
