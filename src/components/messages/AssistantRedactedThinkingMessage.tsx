import React from "react";
import { Text } from "ink";

export function redactedThinkingLabel(reason = "hidden"): string {
  return `thinking ${reason}`;
}

export function AssistantRedactedThinkingMessage(props: { reason?: string }): React.ReactElement {
  return <Text color="gray">{redactedThinkingLabel(props.reason)}</Text>;
}
