import React from "react";
import { Box, Text } from "ink";
import type { EffortLevel } from "../services/inference/inferenceSettingsService.js";
import type { CacheTelemetrySummary } from "../services/cache/telemetry.js";
import { SelectList, type SelectListOption } from "./design/SelectList.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";
import { effortLevelLabel, effortLevelToSymbol } from "./EffortIndicator.js";

export interface EffortCalloutModel {
  title: string;
  message: string;
  selectedIndex: number;
  options: SelectListOption[];
  footer: string;
}

export function EffortCallout(props: {
  model: EffortCalloutModel;
  width: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        <StatusBadge label="token" tone="brand" />
        <Text color="cyan" bold>{` ${props.model.title}`}</Text>
      </Box>
      <Text color="gray">{truncateCells(props.model.message, Math.max(24, props.width - 4))}</Text>
      <SelectList
        options={props.model.options}
        selectedIndex={props.model.selectedIndex}
        visibleCount={4}
        width={props.width}
      />
      <Text color="gray">{truncateCells(props.model.footer, Math.max(24, props.width - 4))}</Text>
    </Box>
  );
}

export function effortCalloutModel(input: {
  effort: EffortLevel;
  model?: string;
  cache?: CacheTelemetrySummary;
}): EffortCalloutModel {
  const options = effortOptions(input.effort);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.selected));
  return {
    title: `${effortLevelToSymbol(input.effort)} ${input.effort} - ${effortLevelLabel(input.effort)}`,
    message: effortMessage(input.effort, input.cache),
    selectedIndex,
    options,
    footer: `Use /effort low for cheaper loops, /cache plan <goal> before large edits, model=${input.model ?? "deepseek"}`,
  };
}

function effortOptions(current: EffortLevel): SelectListOption[] {
  return (["low", "medium", "high", "max"] as const).map((level) => ({
    id: level,
    label: `${effortLevelToSymbol(level)} ${level}`,
    detail: effortLevelLabel(level),
    description: effortDescription(level),
    selected: level === current,
    tone: effortTone(level),
  }));
}

function effortDescription(level: EffortLevel): string {
  if (level === "low") return "lowest token spend for short edits and flash checks";
  if (level === "medium") return "balanced context for normal refactors";
  if (level === "high") return "larger context, use when architecture matters";
  if (level === "max") return "widest context and output cap; confirm cache plan first";
  return "automatic DeepSeekCode budget";
}

function effortMessage(effort: EffortLevel, cache?: CacheTelemetrySummary): string {
  const cacheText = cache && cache.observedRuns > 0
    ? `cache ${cache.rate} (${cache.hitTokens}/${cache.missTokens})`
    : "cache not observed yet";
  if (effort === "low") return `Cheap loop active; keep prompts stable for DeepSeek prefix cache, ${cacheText}.`;
  if (effort === "max") return `Max budget can spend fast; run /cache plan before broad edits, ${cacheText}.`;
  if (effort === "high") return `High budget favors context quality; pin stable facts for better cache reuse, ${cacheText}.`;
  if (effort === "medium") return `Balanced budget; good default when cache hit rate is warming, ${cacheText}.`;
  return `Auto budget follows DeepSeekCode defaults; inspect /cache doctor when hit rate drops, ${cacheText}.`;
}

function effortTone(level: EffortLevel): TerminalTone {
  if (level === "low") return "success";
  if (level === "medium") return "brand";
  if (level === "high") return "warning";
  if (level === "max") return "error";
  return "muted";
}
