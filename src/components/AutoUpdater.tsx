import React from "react";
import { Text } from "ink";

export function autoUpdaterStatus(version: string): string {
  return `DeepSeekCode ${version || "local"}; update manually from the repository.`;
}

export function AutoUpdater(props: { version: string }): React.ReactElement {
  return <Text color="gray">{autoUpdaterStatus(props.version)}</Text>;
}
