import React from "react";
import { StatusBadge } from "../design/StatusBadge.js";

export function teamStatusLabel(active: number, total: number): string {
  return `${Math.max(0, active)}/${Math.max(0, total)} active`;
}

export function TeamStatus(props: { active: number; total: number }): React.ReactElement {
  return <StatusBadge label={teamStatusLabel(props.active, props.total)} tone={props.active > 0 ? "success" : "muted"} />;
}
