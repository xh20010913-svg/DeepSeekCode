import React from "react";
import { Box, Text } from "ink";
import type { RuntimeConfig } from "../bootstrap/config.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { StatusIcon } from "./design/StatusIcon.js";

export function ProviderStatus(props: { config: RuntimeConfig }): React.ReactElement {
  const provider = props.config.provider;
  if (!provider) {
    return (
      <Box>
        <StatusIcon state="warning" withSpace />
        <StatusBadge label="provider missing" tone="warning" />
      </Box>
    );
  }
  return (
    <Box>
      <StatusIcon state="success" withSpace />
      <StatusBadge label={provider.name} tone="success" />
      <Text color="gray">{` ${provider.model}`}</Text>
    </Box>
  );
}
