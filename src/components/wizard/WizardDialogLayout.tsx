import React from "react";
import { Pane } from "../design/Pane.js";

export function WizardDialogLayout(props: { title: string; width: number; children: React.ReactNode }): React.ReactElement {
  return <Pane title={props.title} width={props.width} tone="brand">{props.children}</Pane>;
}
