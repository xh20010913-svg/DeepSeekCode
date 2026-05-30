import React from "react";
import { Box, Text } from "ink";
import { readProjectMemory } from "../memdir/projectMemory.js";

export function MemoryPanel(props: { projectPath: string }): React.ReactElement {
  const memory = readProjectMemory(props.projectPath).trim();
  return (
    <Box flexDirection="column">
      {memory ? (
        memory.split(/\r?\n/).slice(-4).map((line, index) => <Text key={index}>{line}</Text>)
      ) : (
        <Text color="gray">No project memory</Text>
      )}
    </Box>
  );
}
