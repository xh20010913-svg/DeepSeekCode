import React from "react";
import { Box, Text } from "ink";
import type { ContextBundle } from "../context/contextBundle.js";

export function ContextSummary(props: { bundle: ContextBundle }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text>{`repo files ${props.bundle.repositoryMap.files.length}`}</Text>
      <Text>{`selected ${props.bundle.selectedFiles.length}`}</Text>
      <Text>{`approx tokens ${props.bundle.approxTokens}`}</Text>
    </Box>
  );
}
