import React from "react";
import { Box, Text } from "ink";
import { StatusBadge } from "./design/StatusBadge.js";

export function remoteCalloutSummary(input: {
  profile?: string;
  remotePath?: string;
  shellEnabled: boolean;
}): string {
  const target = [input.profile, input.remotePath].filter(Boolean).join(" ");
  const permission = input.shellEnabled ? "shell enabled" : "shell approval required";
  return [target || "remote target", permission].join(" | ");
}

export function RemoteCallout(props: {
  profile?: string;
  remotePath?: string;
  shellEnabled: boolean;
}): React.ReactElement {
  return (
    <Box>
      <StatusBadge label="remote" tone="warning" />
      <Text color="gray"> {remoteCalloutSummary(props)}</Text>
    </Box>
  );
}
