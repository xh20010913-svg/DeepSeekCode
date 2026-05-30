import React from "react";
import { Box, Text } from "ink";

export interface ValidationResultModel {
  status: "failed" | "ok";
  kind: string;
  bytes: number;
  checks: string[];
  errors: string[];
}

const MAX_ITEMS = 8;

export function ValidationResultBlock(props: {
  message: string;
}): React.ReactElement | null {
  const model = parseValidationResultMessage(props.message);
  if (!model) return null;
  const items = model.status === "ok" ? model.checks : model.errors;
  const visible = items.slice(0, MAX_ITEMS);
  const clipped = Math.max(0, items.length - visible.length);

  return (
    <Box flexDirection="column">
      <ValidationRow
        label="valid"
        value={model.status}
        color={model.status === "ok" ? "green" : "red"}
      />
      <ValidationRow label="kind" value={model.kind} />
      <ValidationRow label="bytes" value={String(model.bytes)} />
      {visible.map((item, index) => (
        <ValidationRow
          key={`${index}:${item.slice(0, 24)}`}
          label={model.status === "ok" ? "check" : "error"}
          value={item}
          color={model.status === "ok" ? "gray" : "red"}
        />
      ))}
      {clipped > 0 ? <Text color="gray">{`... ${clipped} more validation items ...`}</Text> : null}
    </Box>
  );
}

export function parseValidationResultMessage(message: string): ValidationResultModel | null {
  const ok = message.match(/^ok:\s*([^,]+),\s*(\d+)\s+bytes,\s*checks:\s*(.+)$/i);
  if (ok) {
    return {
      status: "ok",
      kind: ok[1]?.trim() ?? "unknown",
      bytes: Number(ok[2] ?? 0),
      checks: splitItems(ok[3] ?? ""),
      errors: [],
    };
  }

  const failed = message.match(/^failed:\s*([^,]+),\s*(\d+)\s+bytes,\s*errors:\s*(.+)$/i);
  if (failed) {
    return {
      status: "failed",
      kind: failed[1]?.trim() ?? "unknown",
      bytes: Number(failed[2] ?? 0),
      checks: [],
      errors: splitItems(failed[3] ?? ""),
    };
  }

  return null;
}

function splitItems(value: string): string[] {
  return value
    .split(/[,;]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function ValidationRow(props: {
  label: string;
  value: string;
  color?: string;
}): React.ReactElement {
  return (
    <Box flexDirection="row">
      <Text color="gray">{props.label.padEnd(7)} </Text>
      <Text color={props.color ?? "gray"}>{props.value}</Text>
    </Box>
  );
}
