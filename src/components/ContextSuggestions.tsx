import React from "react";
import { Box, Text } from "ink";
import { StatusIcon, type StatusIconState } from "./design/StatusIcon.js";
import { truncateCells } from "./design/textLayout.js";
import { toneColor, type TerminalTone } from "./design/terminalTheme.js";

export type ContextSuggestionSeverity = Extract<
  StatusIconState,
  "success" | "error" | "warning" | "info"
>;

export interface ContextSuggestion {
  severity: ContextSuggestionSeverity;
  title: string;
  detail: string;
  savingsTokens?: number;
  command?: string;
}

export interface ContextSuggestionModel {
  severity: ContextSuggestionSeverity;
  tone: TerminalTone;
  title: string;
  detail: string;
  savingsLabel: string;
  command: string;
}

export function ContextSuggestions(props: {
  suggestions?: ContextSuggestion[];
  width?: number;
}): React.ReactElement | null {
  const suggestions = props.suggestions ?? [];
  if (suggestions.length === 0) return null;

  const width = Math.max(40, props.width ?? 80);
  const models = suggestions.map(contextSuggestionModel);
  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Text bold>Suggestions</Text>
      {models.map((suggestion, index) => (
        <Box key={`${suggestion.title}-${index}`} flexDirection="column" marginTop={index === 0 ? 0 : 1}>
          <Box flexDirection="row">
            <StatusIcon state={suggestion.severity} withSpace />
            <Text bold color={toneColor(suggestion.tone)}>
              {truncateCells(suggestion.title, Math.max(12, width - 18))}
            </Text>
            {suggestion.savingsLabel ? (
              <Text color={toneColor("muted")}> {suggestion.savingsLabel}</Text>
            ) : null}
          </Box>
          <Box marginLeft={2}>
            <Text color={toneColor("muted")}>
              {truncateCells(suggestion.detail, Math.max(24, width - 6))}
            </Text>
          </Box>
          {suggestion.command ? (
            <Box marginLeft={2}>
              <Text color={toneColor("muted")}>try </Text>
              <Text color={toneColor("brand")}>{truncateCells(suggestion.command, Math.max(16, width - 10))}</Text>
            </Box>
          ) : null}
        </Box>
      ))}
    </Box>
  );
}

export function contextSuggestionModel(suggestion: ContextSuggestion): ContextSuggestionModel {
  return {
    severity: suggestion.severity,
    tone: toneForSeverity(suggestion.severity),
    title: suggestion.title,
    detail: suggestion.detail,
    savingsLabel: suggestion.savingsTokens && suggestion.savingsTokens > 0
      ? `-> save ~${formatContextSavingsTokens(suggestion.savingsTokens)}`
      : "",
    command: suggestion.command ?? "",
  };
}

export function formatContextSavingsTokens(tokens: number): string {
  const rounded = Math.max(0, Math.round(tokens));
  if (rounded >= 10_000) return `${Math.round(rounded / 1000)}k tokens`;
  if (rounded >= 1000) return `${(rounded / 1000).toFixed(1).replace(/\.0$/, "")}k tokens`;
  return `${rounded} tokens`;
}

function toneForSeverity(severity: ContextSuggestionSeverity): TerminalTone {
  if (severity === "success") return "success";
  if (severity === "warning") return "warning";
  if (severity === "error") return "error";
  return "brand";
}
