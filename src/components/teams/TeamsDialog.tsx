import React from "react";
import { Dialog } from "../design/Dialog.js";

export function TeamsDialog(props: { count: number; width?: number }): React.ReactElement {
  return (
    <Dialog title="Agents" statusLabel={`${props.count} configured`} statusTone={props.count > 0 ? "success" : "muted"} width={props.width}>
      Use /agents to manage local DeepSeekCode agents.
    </Dialog>
  );
}
