import React from "react";
import { Box, Text } from "ink";
import { SelectList, type SelectListOption } from "./design/SelectList.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";
import { DEEPSEEK_MODEL_OPTIONS } from "../services/deepseek/models.js";

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
  selectedIndex?: number;
}): ModelPickerModel {
  const active = input.verifiedModel || input.activeModel;
  const knownIds = new Set(DEEPSEEK_MODEL_OPTIONS.map((option) => option.id));
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
    ...DEEPSEEK_MODEL_OPTIONS.map((option) => ({
      ...option,
      tone: option.id.includes("flash") ? "success" as TerminalTone : "warning" as TerminalTone,
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
    selectedIndex: input.selectedIndex ?? selectedIndex,
    footer: "Up/Down select | Enter switch | Esc close | /model flash | /model pro | /model verify",
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
