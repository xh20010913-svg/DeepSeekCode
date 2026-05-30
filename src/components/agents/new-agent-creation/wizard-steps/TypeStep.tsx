import React from "react";
import { Box, Text } from "ink";
import { SelectList, type SelectListOption } from "../../../design/SelectList.js";
import type { AgentCreationType } from "../types.js";

export function typeStepOptions(type: AgentCreationType): SelectListOption[] {
  const options: Array<{ id: AgentCreationType; label: string; detail: string }> = [
    { id: "general", label: "General", detail: "balanced delegated tasks" },
    { id: "reviewer", label: "Reviewer", detail: "bugs, tests, security risk" },
    { id: "builder", label: "Builder", detail: "implementation and refactor work" },
    { id: "tester", label: "Tester", detail: "test design and verification" },
    { id: "researcher", label: "Researcher", detail: "docs, code search, synthesis" },
  ];
  return options.map((option) => ({
    ...option,
    selected: option.id === type,
    tone: option.id === type ? "brand" : "default",
  }));
}

export function TypeStep(props: {
  type: AgentCreationType;
  width?: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color="cyan">Agent type</Text>
      <SelectList options={typeStepOptions(props.type)} width={props.width} visibleCount={5} />
    </Box>
  );
}
