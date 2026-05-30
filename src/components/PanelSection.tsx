import React from "react";
import { Box, Text } from "ink";

export function PanelSection(props: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="gray">{props.title}</Text>
      {props.children}
    </Box>
  );
}
