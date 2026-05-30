import React from "react";
import { Box, Text } from "ink";

export type MessageTimestampValue = number | string | Date | undefined;

export function MessageTimestamp(props: {
  timestamp?: MessageTimestampValue;
}): React.ReactElement | null {
  const formatted = formatMessageTimestamp(props.timestamp);
  if (!formatted) return null;
  return (
    <Box minWidth={formatted.length}>
      <Text dimColor>{formatted}</Text>
    </Box>
  );
}

export function formatMessageTimestamp(timestamp?: MessageTimestampValue): string | null {
  if (!timestamp) return null;
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
