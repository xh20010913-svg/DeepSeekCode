import React from "react";
import { Box, Text } from "ink";
import { SelectList, type SelectListOption } from "../../../design/SelectList.js";
import type { AgentCreationMethod } from "../types.js";

export function methodStepOptions(method: AgentCreationMethod): SelectListOption[] {
  return [
    {
      id: "generate",
      label: "Generate",
      detail: "goal to draft",
      description: "Use DeepSeekCode's cache-friendly agent generator from a short goal.",
      selected: method === "generate",
      tone: "success",
    },
    {
      id: "manual",
      label: "Manual",
      detail: "write fields yourself",
      description: "Best when you already know the exact prompt and tool policy.",
      selected: method === "manual",
      tone: "brand",
    },
  ];
}

export function MethodStep(props: {
  method: AgentCreationMethod;
  width?: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color="cyan">Creation method</Text>
      <SelectList options={methodStepOptions(props.method)} width={props.width} />
    </Box>
  );
}
