import React from "react";
import { Box, Text } from "ink";
import { truncateCells } from "../../../design/textLayout.js";

export interface DescriptionStepModel {
  ready: boolean;
  value: string;
  hint: string;
}

export function descriptionStepModel(description: string, width = 88): DescriptionStepModel {
  const value = description.replace(/\s+/g, " ").trim();
  return {
    ready: value.length >= 8,
    value: value ? truncateCells(value, width) : "No description",
    hint: "Describe when DeepSeekCode should choose this agent.",
  };
}

export function DescriptionStep(props: {
  description: string;
  width?: number;
}): React.ReactElement {
  const model = descriptionStepModel(props.description, props.width);
  return (
    <Box flexDirection="column">
      <Text color="cyan">Description</Text>
      <Text>{model.value}</Text>
      <Text color={model.ready ? "green" : "yellow"}>{model.hint}</Text>
    </Box>
  );
}
