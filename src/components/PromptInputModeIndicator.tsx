import React from "react";
import { Box, Text } from "ink";
import { toneColor, type TerminalTone } from "./design/terminalTheme.js";

export type PromptInputMode = "chat" | "shell" | "agent";

export interface PromptInputModeIndicatorModel {
  marker: string;
  tone: TerminalTone;
  label: string;
}

export function PromptInputModeIndicator(props: {
  mode?: PromptInputMode;
  busy?: boolean;
}): React.ReactElement {
  const model = promptInputModeIndicatorModel(props.mode ?? "chat", Boolean(props.busy));
  return (
    <Box flexDirection="row">
      <Text color={toneColor(model.tone)} dimColor={props.busy}>{model.marker}</Text>
      <Text> </Text>
    </Box>
  );
}

export function promptInputModeIndicatorModel(
  mode: PromptInputMode,
  busy = false,
): PromptInputModeIndicatorModel {
  if (mode === "shell") {
    return { marker: "!", tone: busy ? "warning" : "error", label: "shell" };
  }
  if (mode === "agent") {
    return { marker: "@", tone: busy ? "warning" : "brand", label: "agent" };
  }
  return { marker: ">", tone: busy ? "warning" : "brand", label: "chat" };
}
