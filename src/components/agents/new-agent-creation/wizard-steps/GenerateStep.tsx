import React from "react";
import { Box, Text } from "ink";
import { truncateCells } from "../../../design/textLayout.js";
import type { AgentCreationWizardState } from "../types.js";

export interface GenerateStepModel {
  ready: boolean;
  goal: string;
  hints: string[];
}

export function generateStepModel(state: AgentCreationWizardState, width = 88): GenerateStepModel {
  const goal = state.goal.replace(/\s+/g, " ").trim();
  return {
    ready: state.method === "manual" || goal.length > 0,
    goal: goal ? truncateCells(goal, width) : "No generation goal",
    hints: [
      "Stable role and cache rules stay near the top.",
      state.model === "deepseek-v4-flash" ? "Flash is selected for cheap iteration." : "Consider flash for smoke testing.",
      state.tools.length ? `Tool allowlist: ${state.tools.join(", ")}` : "No allowlist means inherited tools.",
    ],
  };
}

export function GenerateStep(props: {
  state: AgentCreationWizardState;
  width?: number;
}): React.ReactElement {
  const model = generateStepModel(props.state, props.width);
  return (
    <Box flexDirection="column">
      <Text color="cyan">Generate draft</Text>
      <Text>{model.goal}</Text>
      {model.hints.map((hint) => (
        <Text key={hint} color="gray">{hint}</Text>
      ))}
    </Box>
  );
}
