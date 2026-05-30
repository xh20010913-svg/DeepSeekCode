import React from "react";
import { Box, Text } from "ink";
import type { OutputStyle } from "../outputStyles/index.js";
import type { OutputStyleValidationResult } from "../services/outputStyles/outputStyleService.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";
import { ValidationErrorsList, type ValidationListError } from "./ValidationErrorsList.js";

export interface OutputStylePanelModel {
  title: string;
  subtitle: string;
  rows: OutputStylePanelRow[];
  preview?: string[];
  validationErrors?: ValidationListError[];
  footer: string;
}

export interface OutputStylePanelRow {
  key: string;
  name: string;
  status: string;
  tone: TerminalTone;
  detail: string;
  note: string;
}

export function OutputStylePanel(props: {
  model: OutputStylePanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(52, Math.min(112, columns - 4));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="output style" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={`${props.model.rows.length}`} tone={props.model.rows.length > 0 ? "brand" : "muted"} />
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {props.model.rows.map((row) => (
            <OutputStylePanelRowView key={row.key} row={row} width={width} />
          ))}
        </Box>
        {props.model.preview && props.model.preview.length > 0 ? (
          <Box flexDirection="column" marginBottom={1}>
            <Text color="gray">prompt preview</Text>
            {props.model.preview.map((line, index) => (
              <Text key={`${index}-${line}`} color="gray">{truncateCells(`  ${line}`, Math.max(24, width - 4))}</Text>
            ))}
          </Box>
        ) : null}
        <ValidationErrorsList errors={props.model.validationErrors ?? []} width={width - 2} />
        <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
      </Pane>
    </Box>
  );
}

export function outputStyleListPanelModel(styles: OutputStyle[], currentName: string): OutputStylePanelModel {
  return {
    title: "Output styles",
    subtitle: `${styles.length} available style${styles.length === 1 ? "" : "s"}; current ${currentName}`,
    rows: styles.map((style) => ({
      key: `${style.scope}/${style.name}`,
      name: `${style.scope}/${style.name}`,
      status: style.name === currentName ? "current" : style.scope,
      tone: style.name === currentName ? "success" : toneForScope(style.scope),
      detail: style.description,
      note: style.path ?? "(builtin)",
    })),
    footer: "/output-style set <name> | /output-style show <name> | /output-style create <name> <description>",
  };
}

export function outputStyleDetailPanelModel(style: OutputStyle, currentName?: string): OutputStylePanelModel {
  return {
    title: `Output style: ${style.name}`,
    subtitle: `${style.scope}${style.name === currentName ? " / current" : ""}`,
    rows: [{
      key: `${style.scope}/${style.name}`,
      name: `${style.scope}/${style.name}`,
      status: style.name === currentName ? "current" : style.scope,
      tone: style.name === currentName ? "success" : toneForScope(style.scope),
      detail: style.description,
      note: style.path ?? "(builtin)",
    }],
    preview: previewLines(style.prompt),
    footer: `/output-style set ${style.name} | /output-style validate ${style.name}`,
  };
}

export function outputStyleValidationPanelModel(results: OutputStyleValidationResult[]): OutputStylePanelModel {
  return {
    title: "Output style validation",
    subtitle: `${results.length} validation result${results.length === 1 ? "" : "s"}`,
    rows: results.map((result) => ({
      key: result.name,
      name: result.name,
      status: result.ok ? "ok" : "failed",
      tone: result.ok ? "success" : "error",
      detail: result.path || "(missing)",
      note: [
        ...result.errors.map((error) => `error: ${error}`),
        ...result.warnings.map((warning) => `warning: ${warning}`),
      ].join("; "),
    })),
    validationErrors: results.flatMap((result) => [
      ...result.errors.map((error) => ({
        file: result.path || result.name,
        path: result.name,
        message: error,
        severity: "error" as const,
      })),
      ...result.warnings.map((warning) => ({
        file: result.path || result.name,
        path: result.name,
        message: warning,
        severity: "warning" as const,
      })),
    ]),
    footer: "/output-style list | /output-style show <name>",
  };
}

function OutputStylePanelRowView(props: {
  row: OutputStylePanelRow;
  width: number;
}): React.ReactElement {
  const detailWidth = Math.max(20, props.width - 38);
  const noteWidth = Math.max(20, props.width - 12);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row">
        <StatusBadge label={props.row.status} tone={props.row.tone} />
        <Text> </Text>
        <Text color="cyan">{truncateCells(props.row.name.padEnd(20), 20)}</Text>
        <Text color="gray">{truncateCells(props.row.detail, detailWidth)}</Text>
      </Box>
      {props.row.note ? (
        <Box flexDirection="row">
          <Text color="gray">  </Text>
          <Text color="gray">{truncateCells(props.row.note, noteWidth)}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

function toneForScope(scope: OutputStyle["scope"]): TerminalTone {
  if (scope === "builtin") return "brand";
  if (scope === "project" || scope === "user") return "success";
  if (scope === "plugin") return "warning";
  return "muted";
}

function previewLines(prompt: string): string[] {
  return prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);
}
