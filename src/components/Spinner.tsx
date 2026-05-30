import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { truncateCells } from "./design/textLayout.js";
import { toneColor, type TerminalTone } from "./design/terminalTheme.js";

export type SpinnerMode = "working" | "thinking" | "tool" | "queued" | "idle";

export interface SpinnerModel {
  active: boolean;
  frame: string;
  label: string;
  tone: TerminalTone;
}

const FRAMES = ["-", "\\", "|", "/"];

export function Spinner(props: {
  mode: SpinnerMode;
  label?: string;
  detail?: string;
  frameIndex?: number;
  width?: number;
  inline?: boolean;
}): React.ReactElement {
  const [tick, setTick] = useState(0);
  const active = props.mode !== "idle";
  useEffect(() => {
    if (!active || props.frameIndex !== undefined) return;
    const timer = setInterval(() => setTick((previous) => previous + 1), 120);
    return () => clearInterval(timer);
  }, [active, props.frameIndex]);

  const model = spinnerModel(props.mode, {
    label: props.label,
    detail: props.detail,
    frameIndex: props.frameIndex ?? tick,
    width: props.width,
  });
  const content = `${model.frame} ${model.label}`;
  if (props.inline) {
    return <Text color={toneColor(model.tone)}>{content}</Text>;
  }
  return (
    <Box flexDirection="row">
      <Text color={toneColor(model.tone)}>{content}</Text>
    </Box>
  );
}

export function spinnerModel(
  mode: SpinnerMode,
  options: {
    label?: string;
    detail?: string;
    frameIndex?: number;
    width?: number;
  } = {},
): SpinnerModel {
  const active = mode !== "idle";
  const tone = spinnerTone(mode);
  const frame = active ? spinnerFrame(options.frameIndex ?? 0) : " ";
  const label = spinnerLabel(mode, options.label, options.detail, options.width);
  return { active, frame, label, tone };
}

export function spinnerFrame(index: number): string {
  const normalized = Math.abs(Math.floor(index)) % FRAMES.length;
  return FRAMES[normalized] ?? "-";
}

export function spinnerLabel(
  mode: SpinnerMode,
  label?: string,
  detail?: string,
  width = 48,
): string {
  const base = (label?.trim() || defaultSpinnerLabel(mode)).trim();
  const suffix = detail?.trim() ? ` ${detail.trim()}` : "";
  return truncateCells(`${base}${suffix}`, Math.max(8, width));
}

function defaultSpinnerLabel(mode: SpinnerMode): string {
  if (mode === "thinking") return "thinking";
  if (mode === "tool") return "running tool";
  if (mode === "queued") return "queued";
  if (mode === "idle") return "idle";
  return "working";
}

function spinnerTone(mode: SpinnerMode): TerminalTone {
  if (mode === "idle") return "muted";
  if (mode === "thinking") return "brand";
  if (mode === "tool") return "warning";
  if (mode === "queued") return "muted";
  return "success";
}
