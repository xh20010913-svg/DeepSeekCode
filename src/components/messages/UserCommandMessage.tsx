import React from "react";
import { Text } from "ink";

export function userCommandText(command: string): string {
  const trimmed = command.trim();
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function UserCommandMessage(props: { command: string }): React.ReactElement {
  return <Text color="cyan">{userCommandText(props.command)}</Text>;
}
