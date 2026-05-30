import React from "react";
import { TextInput } from "../TextInput.js";
import { normalizePromptInputMode } from "./inputModes.js";

export function PromptInput(props: {
  value: string;
  cursor: number;
  width: number;
  focused?: boolean;
  mode?: string;
  placeholder?: string;
}): React.ReactElement {
  const mode = normalizePromptInputMode(props.mode);
  return (
    <TextInput
      value={props.value}
      cursor={props.cursor}
      width={props.width}
      showCursor={props.focused ?? true}
      placeholder={props.placeholder ?? (mode === "prompt" ? "Type a message" : `${mode} command`)}
    />
  );
}
