import React from "react";
import { Box, Text } from "ink";
import { HookResultBlock, parseHookResultMessage } from "./HookResultBlock.js";
import { MessageResponse, type MessageTone } from "./MessageResponse.js";
import { Markdown } from "./Markdown.js";

export type SystemTextKind = "info" | "usage" | "unknown-command" | "warning" | "error";

export function SystemTextMessage(props: {
  text: string;
}): React.ReactElement {
  if (parseHookResultMessage(props.text)) {
    return <HookResultBlock message={props.text} />;
  }
  const kind = classifySystemText(props.text);
  const text = formatSystemText(props.text);
  if (shouldPreserveSystemTextLayout(props.text)) {
    return (
      <Box flexDirection="column">
        {text.split(/\r?\n/).map((line, index) => (
          <Text key={`${index}-${line.slice(0, 12)}`} dimColor>
            {line || " "}
          </Text>
        ))}
      </Box>
    );
  }
  if (kind === "info") {
    return <Text dimColor>{text || " "}</Text>;
  }
  return (
    <MessageResponse tone={systemTextTone(kind)}>
      <Box flexDirection="column">
        <Text color={systemTextColor(kind)}>{systemTextTitle(kind)}</Text>
        <Markdown dimColor>{text}</Markdown>
      </Box>
    </MessageResponse>
  );
}

export function classifySystemText(text: string): SystemTextKind {
  const normalized = formatSystemText(text);
  if (/^usage:/i.test(normalized)) return "usage";
  if (/^unknown command\b/i.test(normalized)) return "unknown-command";
  if (/\b(provider missing|approval required|permission|paused|blocked)\b/i.test(normalized)) return "warning";
  if (/\b(error|failed|missing api key|invalid api key|denied)\b/i.test(normalized)) return "error";
  return "info";
}

export function formatSystemText(text: string): string {
  if (shouldPreserveSystemTextLayout(text)) return text.trimEnd();
  return text.replace(/\s+/g, " ").trim();
}

function shouldPreserveSystemTextLayout(text: string): boolean {
  return text.includes("OpenClaw 微信登录二维码") ||
    text.includes("OpenClaw WeChat login QR") ||
    text.includes("OpenClaw WeChat browser login") ||
    text.includes("OpenClaw WeChat QR image login") ||
    text.includes("liteapp.weixin.qq.com/q/") ||
    text.includes("qrcode=");
}

function systemTextTitle(kind: SystemTextKind): string {
  if (kind === "usage") return "usage";
  if (kind === "unknown-command") return "unknown command";
  if (kind === "warning") return "attention";
  if (kind === "error") return "error";
  return "system";
}

function systemTextTone(kind: SystemTextKind): MessageTone {
  if (kind === "error") return "error";
  if (kind === "warning" || kind === "usage" || kind === "unknown-command") return "warning";
  return "default";
}

function systemTextColor(kind: SystemTextKind): string {
  if (kind === "error") return "red";
  if (kind === "warning" || kind === "usage" || kind === "unknown-command") return "yellow";
  return "gray";
}
