import React from "react";
import { Text } from "ink";

export function expandShellOutputHint(expanded: boolean): string {
  return expanded ? "showing full shell output" : "shell output clipped";
}

export function ExpandShellOutputContext(props: {
  expanded: boolean;
}): React.ReactElement {
  return <Text color="gray">{expandShellOutputHint(props.expanded)}</Text>;
}
