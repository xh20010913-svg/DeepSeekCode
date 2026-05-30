import React from "react";
import { Box, Text } from "ink";
import { ApprovalGateCard } from "./ApprovalGateCard.js";
import type { ApprovalGateRecord } from "../state/sqlite.js";

export function ApprovalList(props: { gates: ApprovalGateRecord[]; projectPath?: string }): React.ReactElement {
  return (
    <Box flexDirection="column">
      {props.gates.length === 0 ? (
        <Text color="gray">No approval gates</Text>
      ) : (
        props.gates.map((gate) => (
          <ApprovalGateCard key={gate.id} gate={gate} projectPath={props.projectPath} showRun />
        ))
      )}
    </Box>
  );
}
