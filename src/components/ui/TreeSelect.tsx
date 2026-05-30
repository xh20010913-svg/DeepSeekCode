import React from "react";
import { Box, Text } from "ink";
import { SelectList, type SelectListOption } from "../design/SelectList.js";

export interface TreeSelectNode {
  id: string;
  label: string;
  depth?: number;
  selected?: boolean;
  disabled?: boolean;
}

export function treeSelectOptions(nodes: readonly TreeSelectNode[]): SelectListOption[] {
  return nodes.map((node) => ({
    id: node.id,
    label: `${"  ".repeat(Math.max(0, node.depth ?? 0))}${node.label}`,
    detail: node.disabled ? "disabled" : "",
    selected: node.selected,
    disabled: node.disabled,
    tone: node.selected ? "success" : "default",
  }));
}

export function TreeSelect(props: {
  nodes: readonly TreeSelectNode[];
  width?: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color="cyan">Select</Text>
      <SelectList options={treeSelectOptions(props.nodes)} width={props.width} />
    </Box>
  );
}
