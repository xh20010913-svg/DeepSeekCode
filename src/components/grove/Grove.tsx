import React from "react";
import { Box } from "ink";

export function Grove(props: { children: React.ReactNode }): React.ReactElement {
  return <Box flexDirection="column">{props.children}</Box>;
}
