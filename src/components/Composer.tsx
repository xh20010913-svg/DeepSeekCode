import React from "react";
import { Box, Text } from "ink";
import type { SlashCommandSuggestion } from "../prompt/commandSuggestions.js";
import { Divider } from "./design/Divider.js";
import { PromptInputModeIndicator } from "./PromptInputModeIndicator.js";
import { PromptInputFooterSuggestions } from "./PromptInputFooterSuggestions.js";
import { Spinner, spinnerLabel } from "./Spinner.js";
import TextInput from "./TextInput.js";

export function Composer(props: {
  value: string;
  cursor: number;
  busy: boolean;
  queuedCount: number;
  width: number;
  suggestions: SlashCommandSuggestion[];
  selectedSuggestion: number;
}): React.ReactElement {
  const busyLabel = props.busy ? ` - ${spinnerLabel("working", undefined, busyDetail(props.queuedCount), 28)}` : "";
  const promptWidth = Math.max(8, props.width - 6 - busyLabel.length);

  return (
    <Box flexDirection="column">
      <PromptInputFooterSuggestions
        suggestions={props.suggestions}
        selectedSuggestion={props.selectedSuggestion}
        width={props.width}
      />
      <Divider width={props.width} tone={props.busy ? "warning" : "brand"} />
      <Box paddingX={1} minHeight={1} width={props.width}>
        <PromptInputModeIndicator mode="chat" busy={props.busy} />
        <TextInput
          value={props.value}
          cursor={props.cursor}
          width={promptWidth}
        />
        {props.busy && (
          <>
            <Text> </Text>
            <Spinner mode="working" detail={busyDetail(props.queuedCount)} width={28} inline />
          </>
        )}
      </Box>
    </Box>
  );
}

function busyDetail(queuedCount: number): string {
  return queuedCount > 0 ? `queue ${queuedCount}` : "";
}
