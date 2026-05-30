import React from "react";
import { Dialog } from "./design/Dialog.js";

export function exportDialogTitle(kind: string): string {
  return `Export ${kind.trim() || "workspace"}`;
}

export function ExportDialog(props: {
  kind: string;
  outputPath: string;
  width?: number;
}): React.ReactElement {
  return (
    <Dialog title={exportDialogTitle(props.kind)} subtitle={props.outputPath} statusLabel="ready" statusTone="success" width={props.width}>
      Export path is ready.
    </Dialog>
  );
}
