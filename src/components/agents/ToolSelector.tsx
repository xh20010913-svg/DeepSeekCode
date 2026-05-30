import React from "react";
import { Box, Text } from "ink";
import { SelectList, type SelectListOption } from "../design/SelectList.js";
import { normalizeAgentComponentName } from "./utils.js";

export function toolSelectorOptions(
  tools: readonly string[],
  selectedTools: readonly string[] = [],
): SelectListOption[] {
  const selected = new Set(selectedTools.map(normalizeAgentComponentName));
  return tools
    .map((tool) => normalizeAgentComponentName(tool))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .map((tool) => ({
      id: tool,
      label: tool,
      detail: selected.has(tool) ? "enabled" : "available",
      selected: selected.has(tool),
      tone: selected.has(tool) ? "success" : "default",
    }));
}

export function ToolSelector(props: {
  tools: readonly string[];
  selectedTools?: readonly string[];
  selectedIndex?: number;
  width?: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color="cyan">Agent tools</Text>
      <SelectList
        options={toolSelectorOptions(props.tools, props.selectedTools)}
        selectedIndex={props.selectedIndex}
        visibleCount={8}
        width={props.width}
      />
    </Box>
  );
}
