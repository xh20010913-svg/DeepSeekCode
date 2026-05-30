import React from "react";
import { Box, Text } from "ink";
import { StatusBadge } from "./design/StatusBadge.js";
import { StatusIcon, type StatusIconState } from "./design/StatusIcon.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface StatusNoticeInput {
  providerReady: boolean;
  permissionProfile: string;
  shellEnabled: boolean;
  browserEnabled: boolean;
}

export interface StatusNoticeRow {
  id: string;
  state: StatusIconState;
  tone: TerminalTone;
  label: string;
  text: string;
}

export function StatusNoticePanel(props: StatusNoticeInput & { width?: number }): React.ReactElement | null {
  const rows = buildStatusNoticeRows(props);
  if (rows.length === 0) return null;
  const width = props.width ?? 80;
  return (
    <Box flexDirection="column" marginTop={1}>
      {rows.map((row) => (
        <Box key={row.id} flexDirection="row">
          <StatusIcon state={row.state} withSpace />
          <StatusBadge label={row.label} tone={row.tone} />
          <Text color="gray"> </Text>
          <Text color="gray">{truncateCells(row.text, Math.max(16, width - 18))}</Text>
        </Box>
      ))}
    </Box>
  );
}

export function buildStatusNoticeRows(input: StatusNoticeInput): StatusNoticeRow[] {
  const rows: StatusNoticeRow[] = [];
  if (!input.providerReady) {
    rows.push({
      id: "provider",
      state: "warning",
      tone: "warning",
      label: "provider",
      text: "missing DeepSeek provider; set DEEPSEEK_API_KEY or run /doctor",
    });
  }

  if (input.shellEnabled || input.browserEnabled || input.permissionProfile === "open") {
    rows.push({
      id: "permissions",
      state: input.permissionProfile === "open" ? "error" : "warning",
      tone: input.permissionProfile === "open" ? "error" : "warning",
      label: "access",
      text: permissionNoticeText(input),
    });
  }

  if (input.providerReady) {
    rows.push({
      id: "cache",
      state: "pending",
      tone: "muted",
      label: "cache",
      text: "use /cache plan <goal> before large edits to protect DeepSeek prefix reuse",
    });
  }

  return rows.slice(0, 3);
}

function permissionNoticeText(input: StatusNoticeInput): string {
  const enabled = [
    input.shellEnabled ? "shell" : "",
    input.browserEnabled ? "browser" : "",
  ].filter(Boolean).join("+") || input.permissionProfile;
  return `${enabled} access enabled; use /permissions safe before risky work`;
}
