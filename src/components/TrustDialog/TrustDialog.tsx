import React from "react";
import { Dialog } from "../design/Dialog.js";
import { trustModeLabel } from "./utils.js";

export function TrustDialog(props: { trusted: boolean; width?: number }): React.ReactElement {
  return (
    <Dialog title="Workspace trust" statusLabel={props.trusted ? "trusted" : "review"} statusTone={props.trusted ? "success" : "warning"} width={props.width}>
      {trustModeLabel(props.trusted)}
    </Dialog>
  );
}
