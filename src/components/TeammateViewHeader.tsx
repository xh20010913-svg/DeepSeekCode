import React from "react";
import { Text } from "ink";

export function teammateViewHeaderText(name: string): string {
  return `agent ${name.trim() || "detail"}`;
}

export function TeammateViewHeader(props: { name: string }): React.ReactElement {
  return <Text color="cyan">{teammateViewHeaderText(props.name)}</Text>;
}
