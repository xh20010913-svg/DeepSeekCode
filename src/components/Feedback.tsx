import React from "react";
import { Text } from "ink";

export function feedbackTarget(): string {
  return "Open a GitHub issue or project note for feedback.";
}

export function Feedback(): React.ReactElement {
  return <Text color="gray">{feedbackTarget()}</Text>;
}
