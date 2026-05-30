import React from "react";
import { Box, Text } from "ink";
import type { TaskRecord } from "../state/sqlite.js";

export function TaskList(props: { tasks: TaskRecord[] }): React.ReactElement {
  return (
    <Box flexDirection="column">
      {props.tasks.length === 0 ? (
        <Text color="gray">No tasks</Text>
      ) : (
        props.tasks.map((task) => (
          <Text key={task.id}>{`${task.status} ${task.agent}: ${task.title}`}</Text>
        ))
      )}
    </Box>
  );
}
