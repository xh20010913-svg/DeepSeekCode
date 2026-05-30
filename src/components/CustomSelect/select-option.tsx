import React from "react";
import { Box, Text } from "ink";
import { truncateCells } from "../design/textLayout.js";

export function SelectOption(props: {
  label: React.ReactNode;
  description?: string;
  isFocused?: boolean;
  isSelected?: boolean;
  disabled?: boolean;
  width?: number;
}): React.ReactElement {
  const width = props.width ?? 80;
  return (
    <Box flexDirection="column">
      <Text color={props.isFocused ? "cyan" : undefined} dimColor={props.disabled}>
        {props.isFocused ? ">" : " "}
        {" "}
        {props.isSelected ? "[x]" : "[ ]"}
        {" "}
        {props.label}
      </Text>
      {props.description ? (
        <Box paddingLeft={6}>
          <Text color="gray">{truncateCells(props.description, Math.max(12, width - 6))}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
