import React from "react";
import { Box, Text } from "ink";
import type { Command } from "../../types/command.js";

export function helpCommandRows(commands: readonly Command[]): string[] {
  return commands
    .filter((command) => !command.hidden)
    .map((command) => `/${command.name}${command.usage ? ` ${command.usage}` : ""}`)
    .sort();
}

export function Commands(props: {
  commands: readonly Command[];
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      {helpCommandRows(props.commands).map((row) => (
        <Text key={row} color="cyan">{row}</Text>
      ))}
    </Box>
  );
}
