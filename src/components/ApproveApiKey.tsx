import React from "react";
import { Dialog } from "./design/Dialog.js";

export function ApproveApiKey(props: {
  provider: string;
  width?: number;
}): React.ReactElement {
  return (
    <Dialog title="Provider key" subtitle={props.provider} statusLabel="local" statusTone="warning" width={props.width}>
      Configure the provider key in environment or project .env before spending tokens.
    </Dialog>
  );
}
