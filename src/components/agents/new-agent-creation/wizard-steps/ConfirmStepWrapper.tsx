import React from "react";
import { Pane } from "../../../design/Pane.js";
import { ConfirmStep, confirmStepModel } from "./ConfirmStep.js";
import type { AgentCreationWizardState } from "../types.js";

export function ConfirmStepWrapper(props: {
  state: AgentCreationWizardState;
  width: number;
}): React.ReactElement {
  const model = confirmStepModel(props.state);
  return (
    <Pane width={props.width} title="Confirm agent" tone={model.ready ? "success" : "warning"}>
      <ConfirmStep state={props.state} />
    </Pane>
  );
}
