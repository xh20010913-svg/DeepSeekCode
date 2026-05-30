import React from "react";
import { Box, Text } from "ink";
import { SelectList, type SelectListOption } from "../design/SelectList.js";

export const AGENT_MODEL_OPTIONS: SelectListOption[] = [
  {
    id: "inherit",
    label: "Inherit",
    detail: "use current chat model",
    description: "Best for agents that should follow the parent session policy.",
    tone: "muted",
  },
  {
    id: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    detail: "cheap tests, fast routing",
    description: "Recommended for smoke tests and cache-friendly agent iteration.",
    tone: "success",
  },
  {
    id: "deepseek-chat",
    label: "DeepSeek Chat",
    detail: "general coding",
    description: "Use when a background agent needs balanced coding quality.",
    tone: "brand",
  },
  {
    id: "deepseek-reasoner",
    label: "DeepSeek Reasoner",
    detail: "deep planning",
    description: "Reserve for complex task decomposition to save tokens elsewhere.",
    tone: "warning",
  },
];

export function modelSelectorOptions(currentModel: string | undefined): SelectListOption[] {
  const current = currentModel?.trim() || "inherit";
  const known = AGENT_MODEL_OPTIONS.some((option) => option.id === current);
  const base = AGENT_MODEL_OPTIONS.map((option) => ({
    ...option,
    selected: option.id === current,
  }));
  if (known) return base;
  return [
    {
      id: current,
      label: current,
      detail: "custom model",
      description: "This model is preserved from the agent manifest.",
      selected: true,
      tone: "brand",
    },
    ...base.map((option) => ({ ...option, selected: false })),
  ];
}

export function ModelSelector(props: {
  currentModel?: string;
  selectedIndex?: number;
  width?: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color="cyan">Agent model</Text>
      <SelectList
        options={modelSelectorOptions(props.currentModel)}
        selectedIndex={props.selectedIndex}
        visibleCount={5}
        width={props.width}
      />
    </Box>
  );
}
