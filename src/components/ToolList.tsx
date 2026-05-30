import React from "react";
import { Box, Text } from "ink";
import type { Tool, ToolPermissionContext } from "../Tool.js";

export function ToolList(props: {
  tools: Tool[];
  context: ToolPermissionContext;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      {props.tools.map((tool) => {
        const permission = tool.checkPermissions({ type: tool.name }, props.context);
        return (
          <Text key={tool.name}>
            {`${tool.name} ${tool.isEnabled(props.context) ? "on" : "off"} ${permission.behavior}`}
          </Text>
        );
      })}
    </Box>
  );
}
