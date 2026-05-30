import React from "react";
import { Text } from "ink";

export function collapsedReadSearchSummary(count: number, kind = "result"): string {
  return `${Math.max(0, count)} ${kind}${count === 1 ? "" : "s"} collapsed`;
}

export function CollapsedReadSearchContent(props: { count: number; kind?: string }): React.ReactElement {
  return <Text color="gray">{collapsedReadSearchSummary(props.count, props.kind)}</Text>;
}
