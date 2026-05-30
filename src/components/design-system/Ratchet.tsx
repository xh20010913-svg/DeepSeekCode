import React from "react";
import { Box, Text } from "ink";
import { buildProgressBarParts } from "../design/ProgressBar.js";

export interface RatchetModel {
  value: number;
  width: number;
  cells: string;
}

export function ratchetModel(value: number, width = 10): RatchetModel {
  const parts = buildProgressBarParts(value, width, { filled: "#", empty: "-" });
  return {
    value: parts.ratio,
    width: Math.max(0, Math.floor(width)),
    cells: `${parts.filled}${parts.empty}`,
  };
}

export function Ratchet(props: {
  value: number;
  width?: number;
}): React.ReactElement {
  const model = ratchetModel(props.value, props.width);
  return (
    <Box>
      <Text color="cyan">{model.cells}</Text>
    </Box>
  );
}
