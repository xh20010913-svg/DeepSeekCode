import React from "react";
import { Box, Text } from "ink";
import type { PluginSummary } from "../plugins/registry.js";

export function PluginList(props: { plugins: PluginSummary[] }): React.ReactElement {
  return (
    <Box flexDirection="column">
      {props.plugins.length === 0 ? (
        <Text color="gray">No plugins</Text>
      ) : (
        props.plugins.map((plugin) => (
          <Text key={`${plugin.scope}:${plugin.name}`}>
            {`${plugin.scope}/${plugin.name} ${plugin.enabled ? "enabled" : "disabled"}`}
          </Text>
        ))
      )}
    </Box>
  );
}
