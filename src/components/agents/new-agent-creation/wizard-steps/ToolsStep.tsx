import React from "react";
import { ToolSelector, toolSelectorOptions } from "../../ToolSelector.js";

export { toolSelectorOptions as toolsStepOptions };

export function ToolsStep(props: {
  tools: readonly string[];
  selectedTools: readonly string[];
  width?: number;
}): React.ReactElement {
  return (
    <ToolSelector
      tools={props.tools}
      selectedTools={props.selectedTools}
      width={props.width}
    />
  );
}
