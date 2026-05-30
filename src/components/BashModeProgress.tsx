import React from "react";
import { Box, Text } from "ink";
import { formatShellOutput } from "./ShellResultBlock.js";
import { ToolProgress } from "./ToolProgress.js";
import { flattenCellText, truncateCells } from "./design/textLayout.js";

export interface ShellProgressSnapshot {
  output?: string;
  fullOutput?: string;
  elapsedTimeSeconds?: number;
  totalLines?: number;
}

export interface BashModeProgressModel {
  command: string;
  detail: string;
  outputLines: string[];
  elapsedLabel: string;
  totalLinesLabel: string;
}

export function BashModeProgress(props: {
  input: string;
  progress?: ShellProgressSnapshot | null;
  verbose?: boolean;
  width?: number;
}): React.ReactElement {
  const model = bashModeProgressModel(props);
  const width = props.width ?? 96;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text color="gray">{"$ "}</Text>
        <Text>{truncateCells(model.command, Math.max(12, width - 2))}</Text>
      </Text>
      <ToolProgress name="run_command" status="running" detail={model.detail} />
      <Text color="gray">{`${model.elapsedLabel} | ${model.totalLinesLabel}`}</Text>
      {model.outputLines.length > 0 ? (
        <Box flexDirection="column">
          {model.outputLines.map((line, index) => (
            <Text key={`${index}:${line.slice(0, 16)}`} color="gray">
              {truncateCells(line || " ", Math.max(12, width))}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

export function bashModeProgressModel(input: {
  input: string;
  progress?: ShellProgressSnapshot | null;
  verbose?: boolean;
  maxLines?: number;
}): BashModeProgressModel {
  const command = flattenCellText(input.input).trim() || "(empty shell input)";
  const progress = input.progress ?? null;
  const output = input.verbose ? progress?.fullOutput || progress?.output || "" : progress?.output || "";
  return {
    command,
    detail: progress ? "shell command is still running" : "waiting for shell output",
    outputLines: output ? formatShellOutput(output, input.maxLines ?? 8) : [],
    elapsedLabel: typeof progress?.elapsedTimeSeconds === "number"
      ? `${Math.max(0, Math.floor(progress.elapsedTimeSeconds))}s`
      : "0s",
    totalLinesLabel: typeof progress?.totalLines === "number"
      ? `${Math.max(0, progress.totalLines)} lines`
      : "0 lines",
  };
}
