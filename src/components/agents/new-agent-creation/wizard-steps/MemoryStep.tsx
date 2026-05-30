import React from "react";
import { Box, Text } from "ink";
import { SelectList, type SelectListOption } from "../../../design/SelectList.js";

export function memoryStepOptions(enabled: boolean): SelectListOption[] {
  return [
    {
      id: "enabled",
      label: "Use project memory",
      detail: "include stable guidance",
      description: "Good for agents that should follow repository conventions.",
      selected: enabled,
      tone: "success",
    },
    {
      id: "disabled",
      label: "No memory",
      detail: "smaller prompt",
      description: "Useful for cache-sensitive one-off agents.",
      selected: !enabled,
      tone: "muted",
    },
  ];
}

export function MemoryStep(props: {
  enabled: boolean;
  width?: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color="cyan">Project memory</Text>
      <SelectList options={memoryStepOptions(props.enabled)} width={props.width} />
    </Box>
  );
}
