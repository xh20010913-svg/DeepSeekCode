import React from "react";
import { Text } from "ink";

export function advisorMessageText(text: string): string {
  return text.trim() || "No advice";
}

export function AdvisorMessage(props: { text: string }): React.ReactElement {
  return <Text color="cyan">{advisorMessageText(props.text)}</Text>;
}
