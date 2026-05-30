import React from "react";
import { Box, Text } from "ink";
import TextInput from "../TextInput.js";

export function SelectInputOption(props: {
  label: React.ReactNode;
  inputValue: string;
  isFocused?: boolean;
  isSelected?: boolean;
  placeholder?: string;
  width?: number;
}): React.ReactElement {
  const width = props.width ?? 80;
  const prefixWidth = 6;
  return (
    <Box flexDirection="row">
      <Text color={props.isFocused ? "cyan" : undefined}>
        {props.isFocused ? ">" : " "}
        {" "}
        {props.isSelected ? "[x]" : "[ ]"}
        {" "}
      </Text>
      <Text>{props.label}</Text>
      <Text color="gray">{" "}</Text>
      <TextInput
        value={props.inputValue}
        cursor={props.inputValue.length}
        width={Math.max(8, width - prefixWidth)}
        placeholder={props.placeholder}
      />
    </Box>
  );
}
