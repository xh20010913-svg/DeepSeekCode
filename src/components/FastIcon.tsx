import React from "react";
import { Text } from "ink";
import { toneColor, type TerminalTone } from "./design/terminalTheme.js";

const FAST_MARK = ">>";

export interface FastIconModel {
  mark: string;
  tone: TerminalTone;
  label: string;
  cooldown: boolean;
}

export function FastIcon(props: {
  cooldown?: boolean;
}): React.ReactElement {
  const model = fastIconModel(Boolean(props.cooldown));
  return (
    <Text color={toneColor(model.tone)} dimColor={model.cooldown}>
      {model.mark}
    </Text>
  );
}

export function fastIconModel(cooldown = false): FastIconModel {
  return {
    mark: FAST_MARK,
    tone: cooldown ? "muted" : "success",
    label: cooldown ? "fast mode cooling down" : "fast model",
    cooldown,
  };
}

export function getFastIconString(cooldown = false): string {
  return cooldown ? `${FAST_MARK} cooldown` : FAST_MARK;
}

export function isFastModel(model: string): boolean {
  return /\b(flash|fast|lite)\b/i.test(model);
}
