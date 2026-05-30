import React from "react";
import { Text } from "ink";

export function submitQuestionsLabel(answered: number, total: number): string {
  return `${Math.max(0, answered)}/${Math.max(0, total)} answered`;
}

export function SubmitQuestionsView(props: { answered: number; total: number }): React.ReactElement {
  return <Text color={props.answered >= props.total ? "green" : "yellow"}>{submitQuestionsLabel(props.answered, props.total)}</Text>;
}
