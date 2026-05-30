import React from "react";
import { Text } from "ink";

export function thinkingToggleLabel(enabled: boolean): string {
  return enabled ? "thinking visible" : "thinking compact";
}

export function ThinkingToggle(props: {
  enabled: boolean;
}): React.ReactElement {
  return <Text color={props.enabled ? "cyan" : "gray"}>{thinkingToggleLabel(props.enabled)}</Text>;
}
