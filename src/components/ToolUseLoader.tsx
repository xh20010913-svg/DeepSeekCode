import React from "react";
import { Box, Text } from "ink";
import { toneColor, type TerminalTone } from "./design/terminalTheme.js";

export type ToolUseLoaderStatus = "queued" | "running" | "succeeded" | "failed";

export interface ToolUseLoaderModel {
  glyph: string;
  tone: TerminalTone;
  dim: boolean;
  label: string;
}

export function ToolUseLoader(props: {
  status: ToolUseLoaderStatus;
  blinkOn?: boolean;
}): React.ReactElement {
  const model = toolUseLoaderModel(props.status, props.blinkOn);
  return (
    <Box minWidth={2}>
      <Text color={toneColor(model.tone)} dimColor={model.dim}>
        {model.glyph}
      </Text>
    </Box>
  );
}

export function toolUseLoaderModel(
  status: ToolUseLoaderStatus,
  blinkOn = true,
): ToolUseLoaderModel {
  if (status === "failed") {
    return { glyph: "x", tone: "error", dim: false, label: "failed" };
  }
  if (status === "succeeded") {
    return { glyph: "+", tone: "success", dim: false, label: "done" };
  }
  if (status === "queued") {
    return { glyph: ".", tone: "muted", dim: true, label: "queued" };
  }
  return {
    glyph: blinkOn ? "*" : " ",
    tone: "warning",
    dim: false,
    label: "running",
  };
}
