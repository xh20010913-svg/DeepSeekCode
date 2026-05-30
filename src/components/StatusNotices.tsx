import React from "react";
import { Box, Text } from "ink";
import type { StatusNoticeInput } from "./StatusNoticePanel.js";
import { buildStatusNoticeRows, StatusNoticePanel } from "./StatusNoticePanel.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";

export interface StatusNoticesModel {
  count: number;
  title: string;
  subtitle: string;
  highestSeverity: "ok" | "warning" | "error";
}

export function StatusNotices(props: StatusNoticeInput & {
  width?: number;
}): React.ReactElement | null {
  const model = statusNoticesModel(props);
  if (model.count === 0) return null;
  const width = props.width ?? 80;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        <Text color="gray">{model.title} </Text>
        <StatusBadge label={`${model.count}`} tone={model.highestSeverity === "error" ? "error" : "warning"} />
        <Text color="gray"> {truncateCells(model.subtitle, Math.max(12, width - 24))}</Text>
      </Box>
      <StatusNoticePanel
        providerReady={props.providerReady}
        permissionProfile={props.permissionProfile}
        shellEnabled={props.shellEnabled}
        browserEnabled={props.browserEnabled}
        width={width}
      />
    </Box>
  );
}

export function statusNoticesModel(input: StatusNoticeInput): StatusNoticesModel {
  const rows = buildStatusNoticeRows(input);
  const highestSeverity = rows.some((row) => row.tone === "error")
    ? "error"
    : rows.length > 0
      ? "warning"
      : "ok";
  return {
    count: rows.length,
    title: "startup notices",
    subtitle: highestSeverity === "ok"
      ? "ready"
      : "review setup before spending DeepSeek tokens",
    highestSeverity,
  };
}
