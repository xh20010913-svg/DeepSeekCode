import React from "react";
import { Box, Text } from "ink";
import { SelectList, type SelectListOption } from "./design/SelectList.js";

export function outputStylePickerOptions(styles: readonly string[], selected: string): SelectListOption[] {
  return styles.map((style) => ({
    id: style,
    label: style,
    detail: style === selected ? "active" : "available",
    selected: style === selected,
    tone: style === selected ? "success" : "default",
  }));
}

export function OutputStylePicker(props: {
  styles: readonly string[];
  selected: string;
  width?: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color="cyan">Output style</Text>
      <SelectList options={outputStylePickerOptions(props.styles, props.selected)} width={props.width} />
    </Box>
  );
}
