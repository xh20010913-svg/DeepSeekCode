import React from "react";
import { Text } from "ink";
import { toneColor, type TerminalTone } from "./terminalTheme.js";

export type StatusIconState = "success" | "error" | "warning" | "info" | "pending" | "loading";

export interface StatusIconModel {
  icon: string;
  tone: TerminalTone;
}

export function statusIconModel(state: StatusIconState): StatusIconModel {
  if (state === "success") return { icon: "ok", tone: "success" };
  if (state === "error") return { icon: "x", tone: "error" };
  if (state === "warning") return { icon: "!", tone: "warning" };
  if (state === "info") return { icon: "i", tone: "brand" };
  if (state === "loading") return { icon: "..", tone: "muted" };
  return { icon: "-", tone: "muted" };
}

export function StatusIcon(props: {
  state: StatusIconState;
  withSpace?: boolean;
}): React.ReactElement {
  const model = statusIconModel(props.state);
  return (
    <Text color={toneColor(model.tone)}>
      {`[${model.icon}]${props.withSpace ? " " : ""}`}
    </Text>
  );
}
