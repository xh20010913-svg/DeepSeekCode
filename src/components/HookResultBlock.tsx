import React from "react";
import { Box, Text } from "ink";
import { MessageResponse, type MessageTone } from "./MessageResponse.js";
import { StatusIcon, type StatusIconState } from "./design/StatusIcon.js";
import { toneColor } from "./design/terminalTheme.js";

export interface HookResultRow {
  status: "succeeded" | "failed" | "skipped";
  id: string;
  exitCode: string;
  timedOut: boolean;
  notes: string[];
}

export interface HookResultModel {
  rows: HookResultRow[];
  tone: MessageTone;
  state: StatusIconState;
  title: string;
}

export function HookResultBlock(props: {
  message: string;
}): React.ReactElement | null {
  const model = parseHookResultMessage(props.message);
  if (!model) return null;
  return (
    <MessageResponse tone={model.tone}>
      <Box flexDirection="column">
        <Box flexDirection="row">
          <StatusIcon state={model.state} withSpace />
          <Text color={toneColor(model.tone)}>{model.title}</Text>
        </Box>
        {model.rows.map((row) => (
          <Box key={`${row.id}-${row.status}`} flexDirection="column">
            <HookResultLine row={row} />
            {row.notes.slice(0, 2).map((note) => (
              <Text key={`${row.id}-${note}`} color="gray">{`  ${note}`}</Text>
            ))}
          </Box>
        ))}
      </Box>
    </MessageResponse>
  );
}

export function parseHookResultMessage(message: string): HookResultModel | null {
  const rows = parseHookRows(message);
  if (rows.length === 0) return null;
  const failed = rows.filter((row) => row.status === "failed").length;
  const skipped = rows.filter((row) => row.status === "skipped").length;
  const succeeded = rows.filter((row) => row.status === "succeeded").length;
  const tone: MessageTone = failed > 0 ? "error" : skipped > 0 ? "warning" : "success";
  const state: StatusIconState = failed > 0 ? "error" : skipped > 0 ? "warning" : "success";
  return {
    rows,
    tone,
    state,
    title: `hooks ${rows.length} (${[
      succeeded > 0 ? `ok ${succeeded}` : "",
      failed > 0 ? `failed ${failed}` : "",
      skipped > 0 ? `skipped ${skipped}` : "",
    ].filter(Boolean).join(" / ")})`,
  };
}

export function parseHookRows(message: string): HookResultRow[] {
  const rows: HookResultRow[] = [];
  let current: HookResultRow | null = null;
  for (const rawLine of message.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const match = /^(succeeded|failed|skipped)\s+([^\s]+)\s+exit=([^\s]+)(\s+timed_out)?$/i.exec(line.trim());
    if (match) {
      current = {
        status: match[1]!.toLowerCase() as HookResultRow["status"],
        id: match[2]!,
        exitCode: match[3]!,
        timedOut: Boolean(match[4]),
        notes: [],
      };
      rows.push(current);
      continue;
    }
    if (!current || !/^\s+/.test(rawLine)) continue;
    const note = line.trim();
    if (note) current.notes.push(note);
  }
  return rows;
}

function HookResultLine(props: { row: HookResultRow }): React.ReactElement {
  const state = props.row.status === "succeeded" ? "success" : props.row.status === "failed" ? "error" : "warning";
  return (
    <Box flexDirection="row">
      <StatusIcon state={state} withSpace />
      <Text>{props.row.id}</Text>
      <Text color="gray">{` ${props.row.status} exit=${props.row.exitCode}${props.row.timedOut ? " timed out" : ""}`}</Text>
    </Box>
  );
}
