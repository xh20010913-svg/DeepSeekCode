import React from "react";
import { Box, Text } from "ink";
import { SelectList, type SelectListOption } from "./design/SelectList.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface ModelPickerModel {
  title: string;
  subtitle: string;
  options: ModelPickerOption[];
  selectedIndex: number;
  footer: string;
}

export interface ModelPickerOption {
  id: string;
  label: string;
  status: string;
  tone: TerminalTone;
  detail: string;
  description: string;
  selected: boolean;
}

const KNOWN_DEEPSEEK_MODELS: Array<Omit<ModelPickerOption, "selected">> = [
  {
    id: "deepseek-v4-flash",
    label: "deepseek-v4-flash",
    status: "test",
    tone: "success",
    detail: "fast local testing, lower token burn",
    description: "Use this while validating UI and tool loops before spending larger reasoning budgets.",
  },
  {
    id: "deepseek-chat",
    label: "deepseek-chat",
    status: "chat",
    tone: "brand",
    detail: "general coding and review",
    description: "Balanced default for normal coding turns once the frontend flow is stable.",
  },
  {
    id: "deepseek-reasoner",
    label: "deepseek-reasoner",
    status: "think",
    tone: "warning",
    detail: "hard planning, higher token spend",
    description: "Reserve for difficult architecture or debugging tasks where deeper reasoning is worth the cost.",
  },
];

export function ModelPicker(props: {
  model: ModelPickerModel;
  width?: number;
}): React.ReactElement {
  const width = props.width ?? 96;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        <Text color="gray">{props.model.title} </Text>
        <StatusBadge label={`${props.model.options.length}`} tone="brand" />
        <Text color="gray"> {truncateCells(props.model.subtitle, Math.max(16, width - 24))}</Text>
      </Box>
      <SelectList
        options={props.model.options.map(modelPickerSelectOption)}
        selectedIndex={props.model.selectedIndex}
        visibleCount={5}
        width={width}
      />
      <Text color="gray">{truncateCells(props.model.footer, Math.max(18, width - 4))}</Text>
    </Box>
  );
}

export function modelPickerModel(input: {
  activeModel: string;
  providerName?: string | null;
  providerReady: boolean;
  verifiedModel?: string;
}): ModelPickerModel {
  const active = input.verifiedModel || input.activeModel;
  const knownIds = new Set(KNOWN_DEEPSEEK_MODELS.map((option) => option.id));
  const options: ModelPickerOption[] = [
    ...(!knownIds.has(active) ? [{
      id: active,
      label: active,
      status: "current",
      tone: "brand" as TerminalTone,
      detail: "current project model",
      description: "This model is configured locally; keep using it if your provider profile requires it.",
      selected: true,
    }] : []),
    ...KNOWN_DEEPSEEK_MODELS.map((option) => ({
      ...option,
      selected: option.id === active,
    })),
  ];
  const selectedIndex = Math.max(0, options.findIndex((option) => option.selected));
  return {
    title: "model picker",
    subtitle: input.providerReady
      ? `provider ${input.providerName ?? "deepseek"} ready`
      : "provider missing; configure API key before verifying",
    options,
    selectedIndex,
    footer: "/model verify | set DEEPSEEK_MODEL=<name> | keep flash for cheap smoke tests",
  };
}

function modelPickerSelectOption(option: ModelPickerOption): SelectListOption {
  return {
    id: option.id,
    label: option.label,
    detail: `${option.status} | ${option.detail}`,
    description: option.description,
    selected: option.selected,
    tone: option.tone,
  };
}
