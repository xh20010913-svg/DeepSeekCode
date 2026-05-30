import React from "react";
import { Text, type TextProps } from "ink";
import { toneColor, type TerminalTone } from "../design/terminalTheme.js";

export function ThemedText(props: TextProps & {
  tone?: TerminalTone;
  children: React.ReactNode;
}): React.ReactElement {
  const { tone, children, color, ...rest } = props;
  return (
    <Text {...rest} color={color ?? toneColor(tone)}>
      {children}
    </Text>
  );
}
