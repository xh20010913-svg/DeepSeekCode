import React from "react";
import { Box, Text } from "ink";

export function promptNotificationLines(notifications: readonly string[], limit = 3): string[] {
  return notifications.map((item) => item.trim()).filter(Boolean).slice(0, limit);
}

export function Notifications(props: {
  notifications: readonly string[];
}): React.ReactElement | null {
  const lines = promptNotificationLines(props.notifications);
  if (!lines.length) return null;
  return (
    <Box flexDirection="column">
      {lines.map((line) => (
        <Text key={line} color="gray">{line}</Text>
      ))}
    </Box>
  );
}
