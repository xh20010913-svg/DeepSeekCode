import React from "react";
import { Box, Text } from "ink";

export interface ActionSummaryField {
  key: string;
  value: string;
}

export interface ActionSummaryModel {
  action: string;
  fields: ActionSummaryField[];
}

const MAX_VALUE_CHARS = 180;

export function ActionSummaryBlock(props: {
  summary: string;
}): React.ReactElement | null {
  const model = parseActionSummary(props.summary);
  if (!model || model.fields.length === 0) return null;
  return (
    <Box flexDirection="column">
      {model.fields.map((field) => (
        <ActionSummaryRow key={field.key} label={field.key} value={field.value} />
      ))}
    </Box>
  );
}

export function parseActionSummary(summary: string): ActionSummaryModel | null {
  const trimmed = summary.trim();
  if (!trimmed) return null;
  const [action = "", ...restParts] = trimmed.split(/\s+/);
  if (!action || !/^[a-zA-Z0-9_.:-]+$/.test(action)) return null;

  const rest = restParts.join(" ");
  const matches = [...rest.matchAll(/(?:^|\s)([a-zA-Z][a-zA-Z0-9_]*?)=/g)];
  if (matches.length === 0) return { action, fields: [] };

  const fields = matches.map((match, index) => {
    const key = match[1] ?? "";
    const valueStart = (match.index ?? 0) + match[0].length;
    const next = matches[index + 1];
    const valueEnd = next?.index ?? rest.length;
    return {
      key,
      value: compactFieldValue(rest.slice(valueStart, valueEnd).trim()),
    };
  });

  return { action, fields };
}

function compactFieldValue(value: string): string {
  const singleLine = value.replace(/\s+/g, " ").trim();
  return singleLine.length > MAX_VALUE_CHARS
    ? `${singleLine.slice(0, MAX_VALUE_CHARS - 3)}...`
    : singleLine;
}

function ActionSummaryRow(props: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <Box flexDirection="row">
      <Text color="gray">{props.label.padEnd(9)} </Text>
      <Text color="gray">{props.value || "-"}</Text>
    </Box>
  );
}
