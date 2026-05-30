import React from "react";
import { Text } from "ink";

export function userAgentNotificationText(agent: string, status: string): string {
  return `${agent.trim() || "agent"} ${status.trim() || "updated"}`;
}

export function UserAgentNotificationMessage(props: { agent: string; status: string }): React.ReactElement {
  return <Text color="cyan">{userAgentNotificationText(props.agent, props.status)}</Text>;
}
