import React from "react";
import type { SlashCommandSuggestion } from "../prompt/commandSuggestions.js";
import {
  CommandSuggestions,
  visibleSuggestionRows,
  type VisibleSuggestionRow,
} from "./CommandSuggestions.js";

export function PromptInputFooterSuggestions(props: {
  suggestions: SlashCommandSuggestion[];
  selectedSuggestion: number;
  width: number;
}): React.ReactElement | null {
  return (
    <CommandSuggestions
      suggestions={props.suggestions}
      selectedIndex={props.selectedSuggestion}
      width={props.width}
    />
  );
}

export function promptInputFooterSuggestionWindow(
  suggestions: SlashCommandSuggestion[],
  selectedSuggestion: number,
  width: number,
): VisibleSuggestionRow[] {
  return visibleSuggestionRows(suggestions, selectedSuggestion, width >= 72 ? 5 : 4);
}
