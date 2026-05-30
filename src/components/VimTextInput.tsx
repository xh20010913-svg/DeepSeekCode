import React from "react";
import { Box, Text } from "ink";
import { StatusBadge } from "./design/StatusBadge.js";
import type { TerminalTone } from "./design/terminalTheme.js";
import TextInput, { type TextInputProps } from "./TextInput.js";

export type VimInputMode = "insert" | "normal" | "replace";

export interface VimModeModel {
  label: string;
  tone: TerminalTone;
  acceptsText: boolean;
  cursorVisible: boolean;
}

export type VimTextInputProps = TextInputProps & {
  mode?: VimInputMode;
  showMode?: boolean;
};

export function VimTextInput(props: VimTextInputProps): React.ReactElement {
  const { mode = "insert", showMode = true, ...inputProps } = props;
  const model = vimModeModel(mode);
  const showCursor = inputProps.showCursor ?? model.cursorVisible;

  return (
    <Box flexDirection="row">
      {showMode && (
        <>
          <StatusBadge label={model.label} tone={model.tone} />
          <Text> </Text>
        </>
      )}
      <TextInput {...inputProps} showCursor={showCursor} />
    </Box>
  );
}

export function vimModeModel(mode: VimInputMode): VimModeModel {
  if (mode === "normal") {
    return { label: "NOR", tone: "warning", acceptsText: false, cursorVisible: true };
  }
  if (mode === "replace") {
    return { label: "REP", tone: "error", acceptsText: true, cursorVisible: true };
  }
  return { label: "INS", tone: "success", acceptsText: true, cursorVisible: true };
}

export default VimTextInput;
