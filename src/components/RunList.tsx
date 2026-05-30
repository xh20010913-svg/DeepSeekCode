import React from "react";
import { Box, Text } from "ink";
import type { RunRecord } from "../state/sqlite.js";

export function RunList(props: { runs: RunRecord[] }): React.ReactElement {
  return (
    <Box flexDirection="column">
      {props.runs.length === 0 ? (
        <Text color="gray">No runs</Text>
      ) : (
        props.runs.map((run) => (
          <Text key={run.id}>{`${run.status} ${run.actionCount}a ${run.artifactCount}f ${run.message}`}</Text>
        ))
      )}
    </Box>
  );
}
