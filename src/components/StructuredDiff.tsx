import React from "react";
import { DiffReviewPanel } from "./DiffReviewPanel.js";

export function StructuredDiff(props: {
  diff: string;
  maxLines?: number;
}): React.ReactElement {
  const maxLines = props.maxLines ?? 220;
  return <DiffReviewPanel diff={props.diff} maxLines={maxLines} title="Structured diff" sourceLabel="tool result" />;
}

export function isUnifiedDiff(text: string): boolean {
  return /(^|\n)@@\s+-\d+/.test(text) || /(^|\n)---\s+.+\n\+\+\+\s+/.test(text);
}

export function diffLineColor(line: string): string | undefined {
  if (line.startsWith("@@")) return "cyan";
  if (line.startsWith("+++") || line.startsWith("---")) return "gray";
  if (line.startsWith("+")) return "green";
  if (line.startsWith("-")) return "red";
  return undefined;
}
