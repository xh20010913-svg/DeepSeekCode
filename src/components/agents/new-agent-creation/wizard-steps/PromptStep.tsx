import React from "react";
import { Box, Text } from "ink";
import { truncateCells } from "../../../design/textLayout.js";

export interface PromptStepModel {
  ready: boolean;
  lines: string[];
}

export function promptStepModel(prompt: string, width = 88): PromptStepModel {
  const lines = prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((line) => truncateCells(line, width));
  return {
    ready: prompt.trim().length > 0,
    lines: lines.length ? lines : ["No prompt yet"],
  };
}

export function PromptStep(props: {
  prompt: string;
  width?: number;
}): React.ReactElement {
  const model = promptStepModel(props.prompt, props.width);
  return (
    <Box flexDirection="column">
      <Text color="cyan">System prompt</Text>
      {model.lines.map((line, index) => (
        <Text key={`${index}:${line}`} color={model.ready ? undefined : "gray"}>{line}</Text>
      ))}
    </Box>
  );
}
