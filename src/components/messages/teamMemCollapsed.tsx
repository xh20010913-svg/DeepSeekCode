import React from "react";
import { Text } from "ink";

export function teamMemCollapsedLabel(count: number): string {
  return `${Math.max(0, count)} memory entr${count === 1 ? "y" : "ies"} collapsed`;
}

export function TeamMemCollapsed(props: { count: number }): React.ReactElement {
  return <Text color="gray">{teamMemCollapsedLabel(props.count)}</Text>;
}
