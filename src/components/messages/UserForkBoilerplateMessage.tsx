import React from "react";
import { Text } from "ink";

export function forkBoilerplateText(branch: string): string {
  return `forked from ${branch.trim() || "current session"}`;
}

export function UserForkBoilerplateMessage(props: { branch: string }): React.ReactElement {
  return <Text color="gray">{forkBoilerplateText(props.branch)}</Text>;
}
