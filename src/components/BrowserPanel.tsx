import React from "react";
import { Box, Text } from "ink";
import type { BrowserSessionRecord } from "../bridge/browserSessions.js";
import type { BrowserTrajectoryRecord } from "../services/browser/browserTrajectory.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface BrowserPanelModel {
  title: string;
  subtitle: string;
  rows: BrowserPanelRow[];
  preview?: string[];
  footer: string;
}

export interface BrowserPanelRow {
  key: string;
  name: string;
  status: string;
  tone: TerminalTone;
  detail: string;
  note: string;
}

export function BrowserPanel(props: {
  model: BrowserPanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(52, Math.min(112, columns - 4));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="browser" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={`${props.model.rows.length}`} tone={props.model.rows.length > 0 ? "brand" : "muted"} />
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {props.model.rows.length === 0 ? (
            <Text color="gray">No browser records</Text>
          ) : props.model.rows.map((row) => (
            <BrowserPanelRowView key={row.key} row={row} width={width} />
          ))}
        </Box>
        {props.model.preview && props.model.preview.length > 0 ? (
          <Box flexDirection="column" marginBottom={1}>
            <Text color="gray">browser detail</Text>
            {props.model.preview.map((line, index) => (
              <Text key={`${index}-${line}`} color="gray">{truncateCells(`  ${line}`, Math.max(24, width - 4))}</Text>
            ))}
          </Box>
        ) : null}
        <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
      </Pane>
    </Box>
  );
}

export function browserStatusPanelModel(enabled: boolean): BrowserPanelModel {
  return {
    title: "Browser bridge",
    subtitle: enabled ? "permission enabled" : "permission disabled",
    rows: [{
      key: "browser",
      name: "browser",
      status: enabled ? "on" : "off",
      tone: enabled ? "success" : "muted",
      detail: enabled ? "CDP browser actions are allowed" : "browser actions require /browser on",
      note: "snapshot screenshot click type open",
    }],
    footer: "/browser on | /browser sessions | /browser trajectory",
  };
}

export function browserSessionsPanelModel(sessions: BrowserSessionRecord[]): BrowserPanelModel {
  return {
    title: "Browser sessions",
    subtitle: `${sessions.length} recent session${sessions.length === 1 ? "" : "s"}`,
    rows: sessions.map((session) => ({
      key: session.id,
      name: session.id,
      status: session.status,
      tone: session.status === "opened" ? "success" : "warning",
      detail: session.url,
      note: session.visible ? "visible" : "headless",
    })),
    footer: "/browser open <url> | /browser trajectory",
  };
}

export function browserTrajectoryPanelModel(records: BrowserTrajectoryRecord[]): BrowserPanelModel {
  return {
    title: "Browser trajectory",
    subtitle: `${records.length} action record${records.length === 1 ? "" : "s"}`,
    rows: records.map((record) => ({
      key: record.id,
      name: record.action,
      status: record.status,
      tone: record.status === "succeeded" ? "success" : "error",
      detail: record.url,
      note: [
        record.source,
        record.selector ? `selector=${record.selector}` : "",
        record.path ? `path=${record.path}` : "",
        record.title ? `title=${record.title}` : "",
        typeof record.bytes === "number" ? `bytes=${record.bytes}` : "",
        typeof record.textChars === "number" ? `textChars=${record.textChars}` : "",
        record.message ? `message=${record.message}` : "",
      ].filter(Boolean).join(" "),
    })),
    footer: "/browser trajectory [limit] | /browser screenshot <url> <path>",
  };
}

export function browserOperationPanelModel(input: {
  title: string;
  subtitle: string;
  name: string;
  status: string;
  detail: string;
  note?: string;
  footer: string;
  tone?: TerminalTone;
  preview?: string[];
}): BrowserPanelModel {
  return {
    title: input.title,
    subtitle: input.subtitle,
    rows: [{
      key: input.name,
      name: input.name,
      status: input.status,
      tone: input.tone ?? (input.status === "succeeded" || input.status === "ok" ? "success" : "brand"),
      detail: input.detail,
      note: input.note ?? "",
    }],
    preview: input.preview,
    footer: input.footer,
  };
}

function BrowserPanelRowView(props: {
  row: BrowserPanelRow;
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
