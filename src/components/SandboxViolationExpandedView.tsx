import React from "react";
import { Box, Text } from "ink";
import { Pane } from "./design/Pane.js";

export function sandboxViolationLines(message: string): string[] {
  return message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function SandboxViolationExpandedView(props: {
  message: string;
  width: number;
}): React.ReactElement {
  return (
    <Pane width={props.width} title="Permission blocked" tone="error">
      <Box flexDirection="column">
        {sandboxViolationLines(props.message).map((line) => (
          <Text key={line}>{line}</Text>
        ))}
      </Box>
    </Pane>
  );
}
