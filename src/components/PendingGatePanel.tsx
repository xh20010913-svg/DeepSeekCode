import React from "react";
import { Box, Text } from "ink";
import { ApprovalGateCard } from "./ApprovalGateCard.js";
import { useApprovals } from "../hooks/useApprovals.js";
import type { ApprovalGateRecord, StateStore } from "../state/sqlite.js";

export function PendingGatePanel(props: {
  projectPath: string;
  state: StateStore;
  sessionStartedAtMs?: number;
  gates?: ApprovalGateRecord[];
  selectedDecisionIndex?: number;
}): React.ReactElement | null {
  const gates = props.gates ?? useApprovals(props.state, "pending", 20);
  const visibleGates = currentSessionPendingGates(gates, props.sessionStartedAtMs);
  if (visibleGates.length === 0) return null;
  const currentGate = visibleGates[0];
  if (!currentGate) return null;

  return (
    <Box flexDirection="column" paddingX={1} marginTop={1}>
      <ApprovalGateCard
        gate={currentGate}
        projectPath={props.projectPath}
        selectedDecisionIndex={props.selectedDecisionIndex}
      />
      {visibleGates.length > 1 ? (
        <Box paddingLeft={1}>
          <Text color="gray">
            {pendingGateQueueHint(visibleGates.length - 1)}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}

export function currentSessionPendingGates(
  gates: ApprovalGateRecord[],
  sessionStartedAtMs?: number,
): ApprovalGateRecord[] {
  if (sessionStartedAtMs === undefined) return gates;
  return [...gates].sort((left, right) => {
    const leftCurrent = left.createdAtMs >= sessionStartedAtMs ? 1 : 0;
    const rightCurrent = right.createdAtMs >= sessionStartedAtMs ? 1 : 0;
    if (leftCurrent !== rightCurrent) return rightCurrent - leftCurrent;
    return right.createdAtMs - left.createdAtMs;
  });
}

export function pendingGateQueueHint(count: number): string {
  return `${count} more current-session request(s) are queued. Finish the highlighted request first.`;
}
