import React from "react";
import { Box, Text } from "ink";
import { SelectList } from "../../../design/SelectList.js";
import { agentLocationOptions } from "../../agentFileUtils.js";
import type { AgentCreationLocation } from "../types.js";

export function LocationStep(props: {
  location: AgentCreationLocation;
  projectPath: string;
  userAgentsPath?: string;
  width?: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color="cyan">Agent location</Text>
      <SelectList
        options={agentLocationOptions({
          projectPath: props.projectPath,
          userAgentsPath: props.userAgentsPath,
          selected: props.location,
        })}
        width={props.width}
      />
    </Box>
  );
}
