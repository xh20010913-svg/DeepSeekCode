import React from "react";
import { Pane } from "../../design/Pane.js";

export function PreviewBox(props: { children: React.ReactNode; width: number }): React.ReactElement {
  return <Pane width={props.width} title="Question preview" tone="brand">{props.children}</Pane>;
}
