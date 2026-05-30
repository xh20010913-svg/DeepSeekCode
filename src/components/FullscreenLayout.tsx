import React from "react";
import { Box } from "ink";

export function FullscreenLayout(props: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box flexDirection="column" width="100%" height="100%">
      {props.children}
    </Box>
  );
}
