import React from "react";
import { Box, Text } from "ink";
import type { SlashCommandSuggestion } from "../prompt/commandSuggestions.js";
import { Divider } from "./design/Divider.js";
import { PromptInputModeIndicator } from "./PromptInputModeIndicator.js";
import { PromptInputFooterSuggestions } from "./PromptInputFooterSuggestions.js";
import { Spinner, spinnerLabel } from "./Spinner.js";
import TextInput from "./TextInput.js";
import { isChineseUi, type UiLanguage } from "../services/ui/languageService.js";

export interface ComposerLayoutModel {
  busyLabel: string;
  promptWidth: number;
  hint: string;
  placeholder: string;
}

export function Composer(props: {
  value: string;
  cursor: number;
  busy: boolean;
  queuedCount: number;
  width: number;
  suggestions: SlashCommandSuggestion[];
  selectedSuggestion: number;
  activePromptHint?: string;
  language?: UiLanguage;
}): React.ReactElement {
  const model = composerLayoutModel(props);

  return (
    <Box flexDirection="column">
      <PromptInputFooterSuggestions
        suggestions={props.suggestions}
        selectedSuggestion={props.selectedSuggestion}
        width={props.width}
      />
      {model.hint ? (
        <Box paddingX={1}>
          <Text color="gray" wrap="truncate">{model.hint}</Text>
        </Box>
      ) : null}
      <Divider width={props.width} tone={props.busy ? "warning" : "brand"} />
      <Box paddingX={1} minHeight={1} width={props.width}>
        <PromptInputModeIndicator mode="chat" busy={props.busy} />
        <TextInput
          value={props.value}
          cursor={props.cursor}
          width={model.promptWidth}
          placeholder={model.placeholder}
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

export function composerLayoutModel(input: {
  busy: boolean;
  queuedCount: number;
  width: number;
  activePromptHint?: string;
  language?: UiLanguage;
}): ComposerLayoutModel {
  const busyLabel = input.busy ? ` - ${spinnerLabel("working", undefined, busyDetail(input.queuedCount), 28)}` : "";
  const zh = isChineseUi(input.language);
  return {
    busyLabel,
    promptWidth: Math.max(8, input.width - 6 - busyLabel.length),
    hint: input.activePromptHint ?? "",
    placeholder: input.activePromptHint ? (zh ? "在这里输入，或使用上方快捷键" : "Type here or use shortcuts above") : "",
  };
}

function busyDetail(queuedCount: number): string {
  return queuedCount > 0 ? `queue ${queuedCount}` : "";
}
