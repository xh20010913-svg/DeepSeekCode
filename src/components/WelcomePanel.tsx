import React from "react";
import { Box, Text } from "ink";
import { ConfigurableShortcutHint } from "./ConfigurableShortcutHint.js";
import { Byline } from "./design/Byline.js";
import { Divider } from "./design/Divider.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { toneColor } from "./design/terminalTheme.js";
import { StatusNotices } from "./StatusNotices.js";

export interface WelcomeActionRow {
  group: string;
  command: string;
  detail: string;
}

export function WelcomePanel(props: {
  width: number;
  providerReady: boolean;
  model: string;
  projectPath: string;
  permissionProfile: string;
  shellEnabled: boolean;
  browserEnabled: boolean;
}): React.ReactElement {
  const panelWidth = Math.max(44, Math.min(props.width - 2, 96));
  const detailWidth = Math.max(18, panelWidth - 38);
  const rows = welcomeActionRows(props.providerReady);

  return (
    <Box flexDirection="column" paddingTop={1} width={props.width}>
      <Box flexDirection="row">
        <Text color={toneColor("brand")} bold>Welcome to DeepSeekCode</Text>
        <Text> </Text>
        <StatusBadge
          label={props.providerReady ? "ready" : "provider missing"}
          tone={props.providerReady ? "success" : "warning"}
        />
      </Box>
      <Text color="gray">
        {`project ${compactWelcomePath(props.projectPath, Math.max(20, panelWidth - 8))}`}
      </Text>
      <Text color="gray">
        {formatWelcomeRuntimeStatus({
          model: props.model,
          permissionProfile: props.permissionProfile,
          shellEnabled: props.shellEnabled,
          browserEnabled: props.browserEnabled,
        })}
      </Text>
      <StatusNotices
        providerReady={props.providerReady}
        permissionProfile={props.permissionProfile}
        shellEnabled={props.shellEnabled}
        browserEnabled={props.browserEnabled}
        width={panelWidth}
      />

      <Divider width={panelWidth} tone="muted" />
      <Box flexDirection="column">
        {rows.map((row) => (
          <Box key={`${row.group}-${row.command}`} flexDirection="row">
            <Text color="gray">{padRight(row.group, 10)}</Text>
            <Text color={toneColor("brand")}>{padRight(row.command, 24)}</Text>
            <Text color="gray">{truncate(row.detail, detailWidth)}</Text>
          </Box>
        ))}
      </Box>
      <Divider width={panelWidth} tone="muted" />

      {props.providerReady ? (
        <Box flexDirection="row">
          <Text color="gray">Use </Text>
          <Byline>
            <ConfigurableShortcutHint action="prompt:fileMention" fallback="@file" description="attach context" />
            <ConfigurableShortcutHint action="app:commandPalette" fallback="Ctrl+P" description="commands" />
            <ConfigurableShortcutHint action="app:quickOpen" fallback="Ctrl+O" description="quick open" />
          </Byline>
        </Box>
      ) : (
        <Text color="yellow">Set DEEPSEEK_API_KEY in .env, then run /doctor.</Text>
      )}
    </Box>
  );
}

export function welcomeActionRows(providerReady: boolean): WelcomeActionRow[] {
  const setupRow = providerReady
    ? { group: "status", command: "/status", detail: "provider, git, cache, gates" }
    : { group: "setup", command: "/doctor", detail: "check provider and local config" };

  return [
    setupRow,
    { group: "ask", command: "type a task", detail: "plan, edit, review, or explain code" },
    { group: "files", command: "Ctrl+O / @file", detail: "quick open and attach project context" },
    { group: "commands", command: "Ctrl+P / /help", detail: "browse command surface" },
    { group: "cache", command: "/cache plan <goal>", detail: "preview stable prompt blocks first" },
    { group: "safety", command: "/permissions", detail: "switch shell/browser profile" },
  ];
}

export function formatWelcomeRuntimeStatus(props: {
  model: string;
  permissionProfile: string;
  shellEnabled: boolean;
  browserEnabled: boolean;
}): string {
  return [
    `model ${props.model}`,
    `profile ${props.permissionProfile}`,
    `shell ${props.shellEnabled ? "on" : "off"}`,
    `browser ${props.browserEnabled ? "on" : "off"}`,
  ].join("  ");
}

export function compactWelcomePath(value: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized) return ".";
  const max = Math.max(8, maxLength);
  if (normalized.length <= max) return normalized;
  const keep = Math.max(4, max - 3);
  return `...${normalized.slice(normalized.length - keep)}`;
}

function padRight(value: string, width: number): string {
  if (value.length >= width) return value.slice(0, width);
  return value + " ".repeat(width - value.length);
}

function truncate(value: string, width: number): string {
  if (value.length <= width) return value;
  if (width <= 3) return value.slice(0, width);
  return `${value.slice(0, width - 3)}...`;
}
