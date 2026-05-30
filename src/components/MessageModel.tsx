import React from "react";
import { Box, Text } from "ink";

export function MessageModel(props: {
  model?: string;
  streaming?: boolean;
}): React.ReactElement | null {
  const label = formatMessageModel(props.model, props.streaming);
  if (!label) return null;
  return (
    <Box>
      <Text color="gray">{label}</Text>
    </Box>
  );
}

export function formatMessageModel(model?: string, streaming = false): string | null {
  const normalized = model?.trim();
  if (!normalized) return streaming ? "streaming" : null;
  return streaming ? `${normalized} streaming` : normalized;
}
