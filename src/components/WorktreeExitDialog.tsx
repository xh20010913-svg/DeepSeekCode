import React from "react";
import { Dialog } from "./design/Dialog.js";

export function WorktreeExitDialog(props: {
  dirty: boolean;
  width?: number;
}): React.ReactElement {
  return (
    <Dialog title="Workspace exit" statusLabel={props.dirty ? "changes" : "clean"} statusTone={props.dirty ? "warning" : "success"} width={props.width}>
      {props.dirty ? "There are local changes. Review /diff before quitting." : "Workspace is clean."}
    </Dialog>
  );
}
