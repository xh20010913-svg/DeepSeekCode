import React from "react";
import { Text } from "ink";

export function InterruptedByUser(props: {
  followUp?: string;
}): React.ReactElement {
  return (
    <>
      <Text color="yellow">interrupted by user</Text>
      <Text dimColor>{` | ${interruptedByUserPrompt(props.followUp)}`}</Text>
    </>
  );
}

export function interruptedByUserPrompt(followUp = "What should DeepSeekCode do instead?"): string {
  return followUp.trim() || "What should DeepSeekCode do instead?";
}
