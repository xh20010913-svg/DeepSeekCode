import React from "react";
import { Box, Text } from "ink";
import type { RuntimeConfig } from "../bootstrap/config.js";
import type { DeepSeekProviderClient } from "../protocol/provider.js";
import type { StateStore } from "../state/sqlite.js";
import { Workbench } from "../components/Workbench.js";
import { Pane } from "../components/design/Pane.js";

export function ResumeConversation(props: {
  config?: RuntimeConfig;
  state?: StateStore;
  provider?: DeepSeekProviderClient | null;
}): React.ReactElement {
  if (props.config && props.state) {
    return <Workbench config={props.config} state={props.state} provider={props.provider ?? null} />;
  }
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={72} title="resume" tone="brand" paddingX={1}>
        <Text bold color="cyan">Resume conversation</Text>
        <Text color="gray">Use /resume or /sessions to select a local DeepSeekCode transcript.</Text>
      </Pane>
    </Box>
  );
}

export default ResumeConversation;
