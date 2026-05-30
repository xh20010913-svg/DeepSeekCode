import React from "react";
import { Text } from "ink";

export function ProgressLine(props: { label: string; detail?: string }): React.ReactElement {
  return <Text color="yellow">{props.detail ? `${props.label}: ${props.detail}` : props.label}</Text>;
}
