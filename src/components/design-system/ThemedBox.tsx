import React from "react";
import { Box, type BoxProps } from "ink";
import type { TerminalTone } from "../design/terminalTheme.js";

export function ThemedBox(props: BoxProps & {
  tone?: TerminalTone;
  children?: React.ReactNode;
}): React.ReactElement {
  const { tone: _tone, children, ...rest } = props;
  return <Box {...rest}>{children}</Box>;
}
