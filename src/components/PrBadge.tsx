import React from "react";
import { StatusBadge } from "./design/StatusBadge.js";

export function prBadgeLabel(value: string | number): string {
  const text = String(value).replace(/^#/, "").trim();
  return text ? `PR #${text}` : "PR";
}

export function PrBadge(props: {
  value: string | number;
}): React.ReactElement {
  return <StatusBadge label={prBadgeLabel(props.value)} tone="brand" />;
}
