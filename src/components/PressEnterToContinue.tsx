import React from "react";
import { Text } from "ink";

export function PressEnterToContinue(): React.ReactElement {
  return (
    <Text color="cyan">
      Press <Text bold>Enter</Text> to continue
    </Text>
  );
}

export function pressEnterToContinueText(): string {
  return "Press Enter to continue";
}
