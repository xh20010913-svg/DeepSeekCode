import React from "react";
import { Text } from "ink";

export function undercoverAutoLabel(enabled: boolean): string {
  return enabled ? "auto mode on" : "auto mode off";
}

export function UndercoverAutoCallout(props: {
  enabled: boolean;
}): React.ReactElement {
  return <Text color={props.enabled ? "yellow" : "gray"}>{undercoverAutoLabel(props.enabled)}</Text>;
}
