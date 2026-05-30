import React from "react";
import { Box, Text } from "ink";
import { ApprovalGateCard } from "./ApprovalGateCard.js";
import type { ApprovalGateRecord } from "../state/sqlite.js";

export interface ApprovalPanelSummary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  cancelled: number;
}

export function ApprovalPanel(props: {
  gates: ApprovalGateRecord[];
  projectPath?: string;
  title?: string;
}): React.ReactElement {
  const summary = approvalPanelSummary(props.gates);
  return (
    <Box flexDirection="column">
      <Text color="cyan">{props.title ?? "Approval gates"}</Text>
      <Text color="gray">
        {`total ${summary.total} | pending ${summary.pending} | approved ${summary.approved} | rejected ${summary.rejected} | cancelled ${summary.cancelled}`}
      </Text>
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

export function approvalPanelSummary(gates: ApprovalGateRecord[]): ApprovalPanelSummary {
  return {
    total: gates.length,
    pending: gates.filter((gate) => gate.status === "pending").length,
    approved: gates.filter((gate) => gate.status === "approved").length,
    rejected: gates.filter((gate) => gate.status === "rejected").length,
    cancelled: gates.filter((gate) => gate.status === "cancelled").length,
  };
}
