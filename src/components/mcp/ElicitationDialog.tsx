import React from "react";
import { Dialog } from "../design/Dialog.js";

export function ElicitationDialog(props: { prompt: string; width?: number }): React.ReactElement {
  return (
    <Dialog title="MCP question" subtitle={props.prompt} statusLabel="pending" statusTone="warning" width={props.width}>
      MCP server requested input.
    </Dialog>
  );
}
