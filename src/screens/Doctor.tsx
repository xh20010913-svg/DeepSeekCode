import React from "react";
import { Box, Text } from "ink";
import { Pane } from "../components/design/Pane.js";
import { StatusBadge } from "../components/design/StatusBadge.js";

export function Doctor(props: {
  onDone?: (result?: string) => void;
  projectPath?: string;
}): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={72} title="doctor" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold color="cyan">DeepSeekCode doctor</Text>
          <StatusBadge label="local" tone="brand" />
        </Box>
        <Text color="gray">{props.projectPath ?? process.cwd()}</Text>
        <Text color="gray">Use /doctor inside the TUI for live provider, cache, permission, and run checks.</Text>
      </Pane>
    </Box>
  );
}

export default Doctor;
