import React from "react";
import { Box, Text } from "ink";
import { SelectList, type SelectListOption } from "./design/SelectList.js";

export function languagePickerOptions(selected = "auto"): SelectListOption[] {
  const options = [
    ["auto", "Auto", "follow project and user language"],
    ["zh-CN", "Chinese", "Chinese UI and answers"],
    ["en", "English", "English UI and answers"],
  ] as const;
  return options.map(([id, label, detail]) => ({
    id,
    label,
    detail,
    selected: id === selected,
    tone: id === selected ? "brand" : "default",
  }));
}

export function LanguagePicker(props: {
  selected?: string;
  width?: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color="cyan">Language</Text>
      <SelectList options={languagePickerOptions(props.selected)} width={props.width} />
    </Box>
  );
}
