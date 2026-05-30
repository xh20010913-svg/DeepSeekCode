import React from "react";
import { Box, Text } from "ink";
import { StructuredDiff, diffLineColor, isUnifiedDiff } from "./StructuredDiff.js";

export function structuredDiffListModel(diff: string, maxLines = 220): {
  isDiff: boolean;
  visibleLines: string[];
  hidden: number;
} {
  const lines = diff.split(/\r?\n/);
  return {
    isDiff: isUnifiedDiff(diff),
    visibleLines: lines.slice(0, maxLines),
    hidden: Math.max(0, lines.length - maxLines),
  };
}

export function StructuredDiffList(props: {
  diff: string;
  maxLines?: number;
  rich?: boolean;
}): React.ReactElement {
  if (props.rich ?? true) {
    return <StructuredDiff diff={props.diff} maxLines={props.maxLines} />;
  }
  const model = structuredDiffListModel(props.diff, props.maxLines);
  return (
    <Box flexDirection="column">
      {model.visibleLines.map((line, index) => (
        <Text key={`${index}:${line}`} color={diffLineColor(line)}>{line || " "}</Text>
      ))}
      {model.hidden ? <Text color="gray">+{model.hidden} hidden lines</Text> : null}
    </Box>
  );
}
