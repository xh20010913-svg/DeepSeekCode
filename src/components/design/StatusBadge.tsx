import React from "react";
import { Text } from "ink";
import { toneColor, type TerminalTone } from "./terminalTheme.js";

export function StatusBadge(props: {
  label: string;
  tone?: TerminalTone;
}): React.ReactElement {
  return <Text color={toneColor(props.tone)}>{`[${props.label}]`}</Text>;
}
