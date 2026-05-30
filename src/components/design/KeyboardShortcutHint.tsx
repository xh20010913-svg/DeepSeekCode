import React from "react";
import { Text } from "ink";

export interface KeyboardShortcutHintModel {
  shortcut: string;
  action: string;
  parens?: boolean;
}

export function formatKeyboardShortcutHint(model: KeyboardShortcutHintModel): string {
  const body = `${model.shortcut} to ${model.action}`;
  return model.parens ? `(${body})` : body;
}

export function KeyboardShortcutHint(props: KeyboardShortcutHintModel & {
  bold?: boolean;
}): React.ReactElement {
  if (props.parens) {
    return (
      <Text>
        (<Text bold={props.bold}>{props.shortcut}</Text>
        {` to ${props.action})`}
      </Text>
    );
  }
  return (
    <Text>
      <Text bold={props.bold}>{props.shortcut}</Text>
      {` to ${props.action}`}
    </Text>
  );
}
