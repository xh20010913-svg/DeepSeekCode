import React from "react";
import { Box, Text } from "ink";
import { SelectList, type SelectListOption } from "../design/SelectList.js";
import type { AgentMenuItem } from "./types.js";

export function agentsMenuItems(input: {
  hasAgents: boolean;
  hasSelection: boolean;
}): AgentMenuItem[] {
  return [
    {
      id: "list",
      label: "List agents",
      command: "/agents",
      detail: "browse project, user, cache, and plugin agents",
      tone: input.hasAgents ? "success" : "muted",
    },
    {
      id: "show",
      label: "Show agent",
      command: "/agent show",
      detail: "open the selected agent manifest and prompt",
      tone: input.hasSelection ? "brand" : "muted",
    },
    {
      id: "run",
      label: "Run agent",
      command: "/agent run",
      detail: "delegate work to a background agent",
      tone: input.hasSelection ? "success" : "muted",
    },
    {
      id: "new",
      label: "Create agent",
      command: "/agents new",
      detail: "generate a DeepSeek cache-friendly markdown agent",
      tone: "brand",
    },
    {
      id: "doctor",
      label: "Validate agents",
      command: "/agents doctor",
      detail: "check manifests, names, tools, and prompts",
      tone: "warning",
    },
  ];
}

export function agentsMenuOptions(input: {
  hasAgents: boolean;
  hasSelection: boolean;
}): SelectListOption[] {
  return agentsMenuItems(input).map((item) => ({
    id: item.id,
    label: item.label,
    detail: item.command,
    description: item.detail,
    tone: item.tone,
    disabled: (item.id === "show" || item.id === "run") && !input.hasSelection,
  }));
}

export function AgentsMenu(props: {
  hasAgents: boolean;
  hasSelection: boolean;
  selectedIndex?: number;
  width?: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color="cyan">Agent actions</Text>
      <SelectList
        options={agentsMenuOptions(props)}
        selectedIndex={props.selectedIndex}
        visibleCount={5}
        width={props.width}
      />
    </Box>
  );
}
