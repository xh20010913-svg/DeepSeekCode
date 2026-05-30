import React from "react";
import { Box, Text } from "ink";
import type { RuntimeConfig } from "../bootstrap/config.js";

export function DiagnosticsPanel(props: {
  config: RuntimeConfig;
  providerReady: boolean;
  runCount: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text>{`model ${props.config.model}`}</Text>
      <Text>{`provider ${props.providerReady ? "ready" : "missing"}`}</Text>
      <Text>{`runs ${props.runCount}`}</Text>
    </Box>
  );
}
