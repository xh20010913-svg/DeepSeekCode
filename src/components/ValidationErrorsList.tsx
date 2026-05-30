import React from "react";
import { Box, Text } from "ink";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface ValidationListError {
  file?: string;
  path?: string;
  message: string;
  severity?: "error" | "warning";
  invalidValue?: unknown;
  suggestion?: string;
  docLink?: string;
}

export interface ValidationErrorsListModel {
  groups: ValidationErrorsFileGroup[];
  count: number;
}

export interface ValidationErrorsFileGroup {
  file: string;
  rows: ValidationErrorsRow[];
}

export interface ValidationErrorsRow {
  key: string;
  path: string;
  message: string;
  value: string;
  severity: "error" | "warning";
  tone: TerminalTone;
  suggestion: string;
  docLink: string;
}

export function ValidationErrorsList(props: {
  errors: ValidationListError[];
  width?: number;
  title?: string;
}): React.ReactElement | null {
  const model = validationErrorsListModel(props.errors);
  if (model.count === 0) return null;
  const width = props.width ?? 96;
  const title = props.title ?? "validation details";
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        <Text color="gray">{title} </Text>
        <StatusBadge label={`${model.count}`} tone={model.groups.some((group) => group.rows.some((row) => row.severity === "error")) ? "error" : "warning"} />
      </Box>
      {model.groups.map((group) => (
        <Box key={group.file} flexDirection="column" marginTop={1}>
          <Text color="cyan">{truncateCells(group.file, Math.max(16, width - 4))}</Text>
          {group.rows.map((row) => (
            <Box key={row.key} flexDirection="column">
              <Box flexDirection="row">
                <Text color="gray">  </Text>
                <StatusBadge label={row.severity} tone={row.tone} />
                <Text color="gray"> </Text>
                <Text color="gray">{truncateCells(row.path, 24)}</Text>
                <Text color={row.severity === "error" ? "red" : "yellow"}>
                  {truncateCells(` ${row.message}`, Math.max(12, width - 38))}
                </Text>
              </Box>
              {row.value ? (
                <Text color="gray">{truncateCells(`    value: ${row.value}`, Math.max(16, width - 4))}</Text>
              ) : null}
              {row.suggestion ? (
                <Text color="gray">{truncateCells(`    fix: ${row.suggestion}`, Math.max(16, width - 4))}</Text>
              ) : null}
              {row.docLink ? (
                <Text color="gray">{truncateCells(`    docs: ${row.docLink}`, Math.max(16, width - 4))}</Text>
              ) : null}
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}

export function validationErrorsListModel(errors: ValidationListError[]): ValidationErrorsListModel {
  const groups = new Map<string, ValidationErrorsRow[]>();
  for (const error of errors) {
    const file = error.file?.trim() || "(unknown file)";
    const rows = groups.get(file) ?? [];
    rows.push({
      key: `${file}:${error.path ?? ""}:${error.message}`,
      path: error.path?.trim() || "(root)",
      message: error.message.trim() || "(no message)",
      value: formatInvalidValue(error.invalidValue),
      severity: error.severity ?? "error",
      tone: (error.severity ?? "error") === "error" ? "error" : "warning",
      suggestion: error.suggestion?.trim() ?? "",
      docLink: error.docLink?.trim() ?? "",
    });
    groups.set(file, rows);
  }

  return {
    count: errors.length,
    groups: [...groups.entries()]
      .sort(([a], [b]) => compareValidationPath(a, b))
      .map(([file, rows]) => ({
        file,
        rows: rows.sort((a, b) => compareValidationPath(a.path, b.path)),
      })),
  };
}

function compareValidationPath(a: string, b: string): number {
  const lower = a.toLowerCase().localeCompare(b.toLowerCase());
  return lower !== 0 ? lower : a.localeCompare(b);
}

export function formatInvalidValue(value: unknown): string {
  if (value === undefined) return "";
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
