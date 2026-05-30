import React from "react";
import { Box, Text } from "ink";
import { promptInputLabel, truncatePromptForFooter } from "./utils.js";

export function PromptInputFooter(props: {
  mode?: string;
  detail?: string;
  width?: number;
}): React.ReactElement {
  return (
    <Box>
      <Text color="gray">{promptInputLabel(props.mode)}</Text>
      {props.detail ? <Text color="gray"> | {truncatePromptForFooter(props.detail, props.width ?? 80)}</Text> : null}
    </Box>
  );
}
