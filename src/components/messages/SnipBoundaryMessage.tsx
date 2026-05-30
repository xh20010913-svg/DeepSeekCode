import React from "react";
import { Text } from "ink";

export function snipBoundaryText(hiddenChars: number): string {
  return `... ${Math.max(0, hiddenChars)} chars hidden ...`;
}

export function SnipBoundaryMessage(props: { hiddenChars: number }): React.ReactElement {
  return <Text color="gray">{snipBoundaryText(props.hiddenChars)}</Text>;
}
