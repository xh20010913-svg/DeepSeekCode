import React from "react";
import { Box, Text } from "ink";
import { agentMarkdownFilename } from "../../agentFileUtils.js";
import { generateAgentMarkdown } from "../../generateAgent.js";
import { validateAgentDraft } from "../../validateAgent.js";
import type { AgentCreationWizardState } from "../types.js";

export interface ConfirmStepModel {
  ready: boolean;
  filename: string;
  rows: Array<{ label: string; value: string }>;
  errors: string[];
  warnings: string[];
  preview: string[];
}

export function confirmStepModel(state: AgentCreationWizardState): ConfirmStepModel {
  const validation = validateAgentDraft(state);
  return {
    ready: validation.ok,
    filename: agentMarkdownFilename(state.name),
    rows: [
      { label: "location", value: state.location },
      { label: "method", value: state.method },
      { label: "type", value: state.type },
      { label: "model", value: state.model },
      { label: "tools", value: state.tools.length ? state.tools.join(", ") : "all tools" },
    ],
    errors: validation.errors,
    warnings: validation.warnings,
    preview: generateAgentMarkdown(state).split(/\r?\n/).slice(0, 8),
  };
}

export function ConfirmStep(props: {
  state: AgentCreationWizardState;
}): React.ReactElement {
  const model = confirmStepModel(props.state);
  return (
    <Box flexDirection="column">
      <Text color={model.ready ? "green" : "yellow"}>{model.ready ? "Ready to save" : "Needs input"} {model.filename}</Text>
      {model.rows.map((row) => (
        <Box key={row.label}>
          <Text color="gray">{row.label.padEnd(10)}</Text>
          <Text>{row.value}</Text>
        </Box>
      ))}
      {model.errors.map((error) => (
        <Text key={`error:${error}`} color="red">error: {error}</Text>
      ))}
      {model.warnings.map((warning) => (
        <Text key={`warning:${warning}`} color="yellow">warning: {warning}</Text>
      ))}
    </Box>
  );
}
