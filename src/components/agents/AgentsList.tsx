import React from "react";
import { Box, Text } from "ink";
import type { AgentSummary } from "../../agents/discovery.js";
import { SelectList, type SelectListOption } from "../design/SelectList.js";
import { agentPathLabel } from "./agentFileUtils.js";
import { agentRowId, agentScopeTone, compactAgentDescription } from "./utils.js";

export function agentsListOptions(input: {
  agents: readonly AgentSummary[];
  selectedId?: string;
  projectPath?: string;
}): SelectListOption[] {
  return input.agents.map((agent) => {
    const id = agentRowId(agent);
    return {
      id,
      label: agent.name,
      detail: `${agent.scope} | ${agentPathLabel(agent.path, input.projectPath)}`,
      description: compactAgentDescription(agent.description),
      selected: id === input.selectedId,
      tone: agentScopeTone(agent.scope),
    };
  });
}

export function AgentsList(props: {
  agents: readonly AgentSummary[];
  selectedId?: string;
  selectedIndex?: number;
  projectPath?: string;
  width?: number;
}): React.ReactElement {
  const options = agentsListOptions(props);
  return (
    <Box flexDirection="column">
      <Text color="cyan">Agents</Text>
      <SelectList
        options={options}
        selectedIndex={props.selectedIndex}
        visibleCount={8}
        width={props.width}
      />
    </Box>
  );
}
