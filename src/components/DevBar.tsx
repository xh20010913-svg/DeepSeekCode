import React from "react";
import { Box, Text } from "ink";
import { joinBylineItems } from "./design/Byline.js";

export function devBarText(input: {
  version: string;
  model: string;
  cacheRate?: string;
}): string {
  return joinBylineItems([`v${input.version}`, input.model, input.cacheRate ? `cache ${input.cacheRate}` : ""]);
}

export function DevBar(props: {
  version: string;
  model: string;
  cacheRate?: string;
}): React.ReactElement {
  return (
    <Box>
      <Text color="gray">{devBarText(props)}</Text>
    </Box>
  );
}
