import React from "react";
import { Text } from "ink";

export function questionNavigationText(index: number, count: number): string {
  return `${Math.max(1, index + 1)}/${Math.max(1, count)}`;
}

export function QuestionNavigationBar(props: { index: number; count: number }): React.ReactElement {
  return <Text color="gray">{questionNavigationText(props.index, props.count)}</Text>;
}
