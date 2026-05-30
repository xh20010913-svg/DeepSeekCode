import React from "react";
import { Text } from "ink";
import { formatGitStatus, type GitStatusSummary } from "../services/status/projectStatus.js";

export function GitStatus(props: { git: GitStatusSummary }): React.ReactElement {
  const color = !props.git.available ? "gray" : props.git.clean ? "green" : props.git.conflicted > 0 ? "red" : "yellow";
  return <Text color={color}>{formatGitStatus(props.git)}</Text>;
}
