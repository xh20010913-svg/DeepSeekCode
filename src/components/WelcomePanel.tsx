import React from "react";
import { Box, Text } from "ink";
import { ConfigurableShortcutHint } from "./ConfigurableShortcutHint.js";
import { Byline } from "./design/Byline.js";
import { Divider } from "./design/Divider.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { toneColor } from "./design/terminalTheme.js";
import { StatusNotices } from "./StatusNotices.js";
import { isChineseUi, type UiLanguage } from "../services/ui/languageService.js";

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
  language?: UiLanguage;
}): React.ReactElement {
  const panelWidth = Math.max(44, Math.min(props.width - 2, 96));
  const detailWidth = Math.max(18, panelWidth - 38);
  const zh = isChineseUi(props.language);
  const rows = welcomeActionRows(props.providerReady, props.language);

  return (
    <Box flexDirection="column" paddingTop={1} width={props.width}>
      <Box flexDirection="row">
        <Text color={toneColor("brand")} bold>{zh ? "欢迎使用 DeepSeekCode" : "Welcome to DeepSeekCode"}</Text>
        <Text> </Text>
        <StatusBadge
          label={props.providerReady ? (zh ? "就绪" : "ready") : (zh ? "provider 缺失" : "provider missing")}
          tone={props.providerReady ? "success" : "warning"}
        />
      </Box>
      <Text color="gray">
        {`${zh ? "项目" : "project"} ${compactWelcomePath(props.projectPath, Math.max(20, panelWidth - 8))}`}
      </Text>
      <Text color="gray">
        {formatWelcomeRuntimeStatus({
          model: props.model,
          permissionProfile: props.permissionProfile,
          shellEnabled: props.shellEnabled,
          browserEnabled: props.browserEnabled,
          language: props.language,
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
          <Text color="gray">{zh ? "可用 " : "Use "}</Text>
          <Byline>
            <ConfigurableShortcutHint action="prompt:fileMention" fallback="@file" description={zh ? "添加上下文" : "attach context"} />
            <ConfigurableShortcutHint action="app:commandPalette" fallback="Ctrl+P" description={zh ? "命令" : "commands"} />
            <ConfigurableShortcutHint action="app:quickOpen" fallback="Ctrl+O" description={zh ? "快速打开" : "quick open"} />
          </Byline>
        </Box>
      ) : (
        <Text color="yellow">{zh ? "请在 .env 设置 DEEPSEEK_API_KEY，然后运行 /doctor。" : "Set DEEPSEEK_API_KEY in .env, then run /doctor."}</Text>
      )}
    </Box>
  );
}

export function welcomeActionRows(providerReady: boolean, language?: UiLanguage): WelcomeActionRow[] {
  const zh = isChineseUi(language);
  const setupRow = providerReady
    ? { group: zh ? "状态" : "status", command: "/status", detail: zh ? "provider、git、缓存、权限" : "provider, git, cache, gates" }
    : { group: zh ? "配置" : "setup", command: "/doctor", detail: zh ? "检查 provider 和本地配置" : "check provider and local config" };

  return [
    setupRow,
    { group: zh ? "任务" : "ask", command: zh ? "输入任务" : "type a task", detail: zh ? "规划、编辑、审查或解释代码" : "plan, edit, review, or explain code" },
    { group: zh ? "文件" : "files", command: "Ctrl+O / @file", detail: zh ? "快速打开并添加项目上下文" : "quick open and attach project context" },
    { group: zh ? "命令" : "commands", command: "Ctrl+P / /help", detail: zh ? "浏览命令" : "browse command surface" },
    { group: zh ? "缓存" : "cache", command: "/cache plan <goal>", detail: zh ? "先预览稳定 prompt 块" : "preview stable prompt blocks first" },
    { group: zh ? "权限" : "safety", command: "/permissions", detail: zh ? "切换 shell/browser 权限" : "switch shell/browser profile" },
  ];
}

export function formatWelcomeRuntimeStatus(props: {
  model: string;
  permissionProfile: string;
  shellEnabled: boolean;
  browserEnabled: boolean;
  language?: UiLanguage;
}): string {
  const zh = isChineseUi(props.language);
  return [
    `model ${props.model}`,
    `${zh ? "权限" : "profile"} ${props.permissionProfile}`,
    `shell ${props.shellEnabled ? (zh ? "开" : "on") : (zh ? "关" : "off")}`,
    `browser ${props.browserEnabled ? (zh ? "开" : "on") : (zh ? "关" : "off")}`,
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
