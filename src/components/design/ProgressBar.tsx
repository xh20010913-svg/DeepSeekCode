import React from "react";
import { Box, Text } from "ink";
import { toneColor, type TerminalTone } from "./terminalTheme.js";

export interface ProgressBarParts {
  ratio: number;
  filled: string;
  empty: string;
  percent: string;
}

export function buildProgressBarParts(
  ratio: number,
  width: number,
  chars: { filled?: string; empty?: string } = {},
): ProgressBarParts {
  const normalizedWidth = Math.max(0, Math.floor(width));
  const normalizedRatio = clampRatio(ratio);
  const filledChar = chars.filled ?? "#";
  const emptyChar = chars.empty ?? ".";
  const filledCells = Math.round(normalizedRatio * normalizedWidth);
  const emptyCells = Math.max(0, normalizedWidth - filledCells);

  return {
    ratio: normalizedRatio,
    filled: filledChar.repeat(filledCells),
    empty: emptyChar.repeat(emptyCells),
    percent: `${Math.round(normalizedRatio * 100)}%`,
  };
}

export function ProgressBar(props: {
  ratio: number;
  width: number;
  filledTone?: TerminalTone;
  emptyTone?: TerminalTone;
  showPercent?: boolean;
}): React.ReactElement {
  const parts = buildProgressBarParts(props.ratio, props.width);
  return (
    <Box flexDirection="row">
      <Text color="gray">[</Text>
      <Text color={toneColor(props.filledTone ?? "brand")}>{parts.filled}</Text>
      <Text color={toneColor(props.emptyTone ?? "muted")}>{parts.empty}</Text>
      <Text color="gray">]</Text>
      {props.showPercent && <Text color="gray">{` ${parts.percent}`}</Text>}
    </Box>
  );
}

export function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
