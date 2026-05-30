import React from "react";
import { Box, Text } from "ink";
import { SelectList, type SelectListOption } from "../design/SelectList.js";

export function memoryFileOptions(paths: readonly string[], selectedPath?: string): SelectListOption[] {
  return paths.map((memoryPath) => ({
    id: memoryPath,
    label: memoryPath.split(/[\\/]/).pop() || memoryPath,
    detail: memoryPath,
    selected: memoryPath === selectedPath,
    tone: memoryPath === selectedPath ? "success" : "default",
  }));
}

export function MemoryFileSelector(props: {
  paths: readonly string[];
  selectedPath?: string;
  width?: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color="cyan">Memory file</Text>
      <SelectList options={memoryFileOptions(props.paths, props.selectedPath)} width={props.width} />
    </Box>
  );
}
