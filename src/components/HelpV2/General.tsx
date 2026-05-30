import React from "react";
import { Box, Text } from "ink";

export function generalHelpLines(): string[] {
  return [
    "Use /help to browse commands.",
    "Use /doctor before spending provider tokens.",
    "Use /cache plan <goal> for DeepSeek cache-aware planning.",
  ];
}

export function General(): React.ReactElement {
  return (
    <Box flexDirection="column">
      {generalHelpLines().map((line) => (
        <Text key={line} color="gray">{line}</Text>
      ))}
    </Box>
  );
}
