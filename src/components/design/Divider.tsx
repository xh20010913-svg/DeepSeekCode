import React from "react";
import { Text } from "ink";
import { toneColor, type TerminalTone } from "./terminalTheme.js";

export function Divider(props: {
  width: number;
  title?: string;
  tone?: TerminalTone;
  char?: string;
}): React.ReactElement {
  const char = props.char ?? "-";
  const width = Math.max(0, props.width);
  const title = props.title?.trim();
  const color = toneColor(props.tone ?? "muted");
  if (!title) {
    return <Text color={color}>{char.repeat(width)}</Text>;
  }
  const label = ` ${title} `;
  if (label.length >= width) {
    return <Text color={color}>{label.slice(0, width)}</Text>;
  }
  const remaining = width - label.length;
  const left = Math.floor(remaining / 2);
  const right = remaining - left;
  return <Text color={color}>{`${char.repeat(left)}${label}${char.repeat(right)}`}</Text>;
}
