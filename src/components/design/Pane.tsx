import React from "react";
import { Box } from "ink";
import { Divider } from "./Divider.js";
import type { TerminalTone } from "./terminalTheme.js";

export function Pane(props: {
  children: React.ReactNode;
  width: number;
  title?: string;
  tone?: TerminalTone;
  paddingX?: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Divider width={props.width} title={props.title} tone={props.tone} />
      <Box flexDirection="column" paddingX={props.paddingX ?? 1}>
        {props.children}
      </Box>
    </Box>
  );
}
