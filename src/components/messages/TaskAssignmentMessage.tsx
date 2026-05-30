import React from "react";
import { Text } from "ink";

export function taskAssignmentText(agent: string, task: string): string {
  return `${agent.trim() || "agent"} <- ${task.trim() || "task"}`;
}

export function TaskAssignmentMessage(props: { agent: string; task: string }): React.ReactElement {
  return <Text color="cyan">{taskAssignmentText(props.agent, props.task)}</Text>;
}
