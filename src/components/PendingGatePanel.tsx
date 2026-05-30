import React from "react";
import { Box } from "ink";
import { ApprovalGateCard } from "./ApprovalGateCard.js";
import { useApprovals } from "../hooks/useApprovals.js";
import type { StateStore } from "../state/sqlite.js";

export function PendingGatePanel(props: {
  projectPath: string;
  state: StateStore;
}): React.ReactElement | null {
  const gates = useApprovals(props.state, "pending", 5);
  if (gates.length === 0) return null;

  return (
    <Box flexDirection="column" paddingX={1} marginTop={1}>
      {gates.map((gate) => (
        <ApprovalGateCard key={gate.id} gate={gate} projectPath={props.projectPath} />
      ))}
    </Box>
  );
}
