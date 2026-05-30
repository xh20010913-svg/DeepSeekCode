import React from "react";
import { StatusBadge } from "../design/StatusBadge.js";

export function compactBoundaryLabel(hiddenMessages: number): string {
  return `compact +${Math.max(0, hiddenMessages)}`;
}

export function CompactBoundaryMessage(props: { hiddenMessages: number }): React.ReactElement {
  return <StatusBadge label={compactBoundaryLabel(props.hiddenMessages)} tone="muted" />;
}
