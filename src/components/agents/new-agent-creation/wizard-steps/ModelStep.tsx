import React from "react";
import { ModelSelector, modelSelectorOptions } from "../../ModelSelector.js";

export { modelSelectorOptions as modelStepOptions };

export function ModelStep(props: {
  model: string;
  width?: number;
}): React.ReactElement {
  return <ModelSelector currentModel={props.model} width={props.width} />;
}
