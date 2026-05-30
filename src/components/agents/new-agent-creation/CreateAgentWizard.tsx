import React from "react";
import { Box, Text } from "ink";
import { Pane } from "../../design/Pane.js";
import { ProgressBar } from "../../design/ProgressBar.js";
import { SelectList, type SelectListOption } from "../../design/SelectList.js";
import { agentMarkdownFilename } from "../agentFileUtils.js";
import { generateAgentMarkdown } from "../generateAgent.js";
import { validateAgentDraft } from "../validateAgent.js";
import { AGENT_CREATION_STEPS, type AgentCreationStepId, type AgentCreationWizardState } from "./types.js";

export interface CreateAgentWizardModel {
  activeIndex: number;
  activeStep: AgentCreationStepId;
  progress: number;
  title: string;
  subtitle: string;
  stepOptions: SelectListOption[];
  ready: boolean;
  filename: string;
  markdownPreview: string[];
  warnings: string[];
  errors: string[];
}

export function createAgentWizardModel(input: {
  state: AgentCreationWizardState;
  activeStep?: AgentCreationStepId;
}): CreateAgentWizardModel {
  const activeIndex = Math.max(
    0,
    AGENT_CREATION_STEPS.findIndex((step) => step.id === (input.activeStep ?? "method")),
  );
  const validation = validateAgentDraft(input.state);
  const activeStep = AGENT_CREATION_STEPS[activeIndex] ?? AGENT_CREATION_STEPS[0]!;
  const progress = (activeIndex + 1) / AGENT_CREATION_STEPS.length;
  return {
    activeIndex,
    activeStep: activeStep.id,
    progress,
    title: `Create agent: ${activeStep.title}`,
    subtitle: activeStep.detail,
    stepOptions: AGENT_CREATION_STEPS.map((step, index) => ({
      id: step.id,
      label: step.title,
      detail: step.detail,
      selected: index === activeIndex,
      tone: index < activeIndex ? "success" : index === activeIndex ? "brand" : "muted",
    })),
    ready: validation.ok,
    filename: agentMarkdownFilename(input.state.name),
    markdownPreview: generateAgentMarkdown(input.state).split(/\r?\n/).slice(0, 10),
    warnings: validation.warnings,
    errors: validation.errors,
  };
}

export function CreateAgentWizard(props: {
  state: AgentCreationWizardState;
  activeStep?: AgentCreationStepId;
  width: number;
}): React.ReactElement {
  const model = createAgentWizardModel(props);
  return (
    <Pane width={props.width} title={model.title} tone={model.ready ? "success" : "brand"}>
      <Box flexDirection="column">
        <Text color="gray">{model.subtitle}</Text>
        <ProgressBar ratio={model.progress} width={Math.max(10, props.width - 4)} filledTone="brand" />
        <SelectList
          options={model.stepOptions}
          selectedIndex={model.activeIndex}
          visibleCount={6}
          width={Math.max(24, props.width - 4)}
        />
        <Box marginTop={1}>
          <Text color={model.ready ? "green" : "yellow"}>{model.ready ? "ready" : "needs input"} </Text>
          <Text color="gray">{model.filename}</Text>
        </Box>
      </Box>
    </Pane>
  );
}
