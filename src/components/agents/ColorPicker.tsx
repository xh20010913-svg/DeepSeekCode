import React from "react";
import { Box, Text } from "ink";
import { SelectList, type SelectListOption } from "../design/SelectList.js";

export interface AgentColorOption {
  id: string;
  label: string;
  detail: string;
  terminalColor?: string;
}

export const AGENT_COLOR_OPTIONS: AgentColorOption[] = [
  { id: "cyan", label: "Cyan", detail: "DeepSeek default", terminalColor: "cyan" },
  { id: "green", label: "Green", detail: "cache and success work", terminalColor: "green" },
  { id: "yellow", label: "Yellow", detail: "review and caution", terminalColor: "yellow" },
  { id: "magenta", label: "Magenta", detail: "creative planning", terminalColor: "magenta" },
  { id: "blue", label: "Blue", detail: "research and docs", terminalColor: "blue" },
  { id: "red", label: "Red", detail: "security and risk", terminalColor: "red" },
  { id: "gray", label: "Gray", detail: "quiet background agent", terminalColor: "gray" },
];

export function colorPickerOptions(selectedColor: string | undefined): SelectListOption[] {
  const selected = selectedColor?.trim().toLowerCase() || "cyan";
  return AGENT_COLOR_OPTIONS.map((option) => ({
    id: option.id,
    label: option.label,
    detail: option.detail,
    selected: option.id === selected,
    tone: option.id === selected ? "brand" : "default",
  }));
}

export function ColorPicker(props: {
  selectedColor?: string;
  selectedIndex?: number;
  width?: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color="cyan">Agent color</Text>
      <SelectList
        options={colorPickerOptions(props.selectedColor)}
        selectedIndex={props.selectedIndex}
        visibleCount={7}
        width={props.width}
      />
    </Box>
  );
}
