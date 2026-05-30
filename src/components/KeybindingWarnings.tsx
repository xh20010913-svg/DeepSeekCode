import React from "react";
import { Box, Text } from "ink";
import { Pane } from "./design/Pane.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export type KeybindingWarningSeverity = "error" | "warning";

export interface KeybindingWarning {
  severity: KeybindingWarningSeverity;
  message: string;
  suggestion?: string;
}

export interface KeybindingWarningsModel {
  visible: boolean;
  title: string;
  path: string;
  rows: KeybindingWarningRow[];
  statusLabel: string;
  tone: TerminalTone;
}

export interface KeybindingWarningRow {
  key: string;
  severity: KeybindingWarningSeverity;
  label: string;
  message: string;
  suggestion: string;
  tone: TerminalTone;
}

export function KeybindingWarnings(props: {
  warnings: KeybindingWarning[];
  path: string;
  enabled?: boolean;
  width?: number;
}): React.ReactElement | null {
  const model = keybindingWarningsModel(props);
  if (!model.visible) return null;
  const width = props.width ?? 96;
  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Pane width={width} title="keybindings" tone={model.tone} paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text color={model.tone === "error" ? "red" : "yellow"} bold>{model.title}</Text>
          <StatusBadge label={model.statusLabel} tone={model.tone} />
        </Box>
        <Text color="gray">{truncateCells(model.path, Math.max(16, width - 4))}</Text>
        <Box flexDirection="column" marginTop={1}>
          {model.rows.map((row) => (
            <Box key={row.key} flexDirection="column" marginBottom={1}>
              <Text>
                <StatusBadge label={row.label} tone={row.tone} />
                <Text color="gray">{` ${truncateCells(row.message, Math.max(16, width - 14))}`}</Text>
              </Text>
              {row.suggestion ? (
                <Text color="gray">{truncateCells(`  -> ${row.suggestion}`, Math.max(16, width - 4))}</Text>
              ) : null}
            </Box>
          ))}
        </Box>
      </Pane>
    </Box>
  );
}

export function keybindingWarningsModel(input: {
  warnings: KeybindingWarning[];
  path: string;
  enabled?: boolean;
}): KeybindingWarningsModel {
  const enabled = input.enabled ?? true;
  const rows = input.warnings.map((warning, index) => ({
    key: `${warning.severity}-${index}`,
    severity: warning.severity,
    label: warning.severity === "error" ? "Error" : "Warning",
    message: flattenWarningText(warning.message),
    suggestion: flattenWarningText(warning.suggestion ?? ""),
    tone: warning.severity === "error" ? "error" as const : "warning" as const,
  }));
  const errorCount = rows.filter((row) => row.severity === "error").length;
  return {
    visible: enabled && rows.length > 0,
    title: "Keybinding configuration issues",
    path: input.path,
    rows,
    statusLabel: errorCount > 0 ? `${errorCount} error` : `${rows.length} warning`,
    tone: errorCount > 0 ? "error" : "warning",
  };
}

function flattenWarningText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
