import React from "react";
import { Text } from "ink";

export function memoryInputText(text: string): string {
  return `memory: ${text.trim() || "empty"}`;
}

export function UserMemoryInputMessage(props: { text: string }): React.ReactElement {
  return <Text color="gray">{memoryInputText(props.text)}</Text>;
}
