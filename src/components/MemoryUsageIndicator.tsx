import React from "react";
import { Box, Text } from "ink";
import { useMemoryUsage, type MemoryUsageInfo } from "../hooks/useMemoryUsage.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface MemoryUsageIndicatorModel {
  label: string;
  tone: TerminalTone;
  text: string;
}

export function MemoryUsageIndicator(props: {
  width?: number;
}): React.ReactElement | null {
  const info = useMemoryUsage();
  const model = memoryUsageIndicatorModel(info);
  if (!model) return null;
  const width = props.width ?? 80;
  return (
    <Box flexDirection="row" paddingX={1}>
      <StatusBadge label={model.label} tone={model.tone} />
      <Text color="gray"> </Text>
      <Text color="gray">{truncateCells(model.text, Math.max(20, width - 12))}</Text>
    </Box>
  );
}

export function memoryUsageIndicatorModel(info: MemoryUsageInfo | null): MemoryUsageIndicatorModel | null {
  if (!info || info.status === "normal") return null;
  const size = formatMemoryBytes(info.heapUsed);
  if (info.status === "critical") {
    return {
      label: "memory",
      tone: "error",
      text: `critical heap ${size}; run /compact, finish current task, then restart before large edits`,
    };
  }
  return {
    label: "memory",
    tone: "warning",
    text: `high heap ${size}; use /compact or /cache plan before a token-heavy request`,
  };
}

export function formatMemoryBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(0, bytes);
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}
