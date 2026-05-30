import React from "react";
import { Box, Text } from "ink";
import { StatusIcon, type StatusIconState } from "./design/StatusIcon.js";
import { toneColor, type TerminalTone } from "./design/terminalTheme.js";

export interface TokenBudgetWarningInput {
  usedTokens: number;
  contextLimit: number;
  model: string;
}

export interface TokenBudgetWarningModel {
  state: StatusIconState;
  tone: TerminalTone;
  title: string;
  detail: string;
  recommendation: string;
}

export function buildTokenBudgetWarning(input: TokenBudgetWarningInput): TokenBudgetWarningModel | null {
  if (!Number.isFinite(input.usedTokens) || !Number.isFinite(input.contextLimit) || input.contextLimit <= 0) {
    return null;
  }
  const usedRatio = Math.max(0, input.usedTokens / input.contextLimit);
  if (usedRatio < 0.75) return null;

  const usedPercent = Math.min(100, Math.round(usedRatio * 100));
  const remaining = Math.max(0, input.contextLimit - input.usedTokens);
  const critical = usedRatio >= 0.9;
  return {
    state: critical ? "error" : "warning",
    tone: critical ? "error" : "warning",
    title: `context ${usedPercent}% used`,
    detail: `${remaining} tokens remaining on ${input.model}`,
    recommendation: critical ? "compact before another large tool turn" : "prefer /cache plan before expanding context",
  };
}

export function TokenBudgetWarning(props: TokenBudgetWarningInput): React.ReactElement | null {
  const model = buildTokenBudgetWarning(props);
  if (!model) return null;
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <StatusIcon state={model.state} withSpace />
        <Text color={toneColor(model.tone)}>{model.title}</Text>
      </Box>
      <Text color="gray">{model.detail}</Text>
      <Text color="gray">{model.recommendation}</Text>
    </Box>
  );
}
