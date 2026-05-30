import React from "react";
import { Text } from "ink";

export function shutdownMessageText(reason?: string): string {
  return reason?.trim() ? `Shutdown: ${reason.trim()}` : "Shutdown requested";
}

export function ShutdownMessage(props: { reason?: string }): React.ReactElement {
  return <Text color="yellow">{shutdownMessageText(props.reason)}</Text>;
}
