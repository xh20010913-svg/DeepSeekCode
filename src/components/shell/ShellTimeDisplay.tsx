import React from "react";
import { Text } from "ink";

export function shellTimeLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ShellTimeDisplay(props: {
  ms: number;
}): React.ReactElement {
  return <Text color="gray">{shellTimeLabel(props.ms)}</Text>;
}
