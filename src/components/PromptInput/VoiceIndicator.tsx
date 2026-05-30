import React from "react";
import { Text } from "ink";

export function voiceIndicatorLabel(enabled: boolean): string {
  return enabled ? "voice on" : "voice off";
}

export function VoiceIndicator(props: {
  enabled: boolean;
}): React.ReactElement {
  return <Text color={props.enabled ? "cyan" : "gray"}>{voiceIndicatorLabel(props.enabled)}</Text>;
}
