import React from "react";
import { Text } from "ink";

export function shellOutputLineTone(line: string): "error" | "warning" | "muted" | "default" {
  if (/error|failed|exception/i.test(line)) return "error";
  if (/warn|deprecated/i.test(line)) return "warning";
  if (!line.trim()) return "muted";
  return "default";
}

export function OutputLine(props: {
  line: string;
}): React.ReactElement {
  const tone = shellOutputLineTone(props.line);
  const color = tone === "error" ? "red" : tone === "warning" ? "yellow" : tone === "muted" ? "gray" : undefined;
  return <Text color={color}>{props.line || " "}</Text>;
}
