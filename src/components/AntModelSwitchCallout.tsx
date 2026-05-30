import React from "react";
import { Text } from "ink";

export function antModelSwitchMessage(model: string): string {
  return model.includes("flash")
    ? "Flash model selected for cheap DeepSeekCode testing."
    : `Model ${model || "inherit"} selected. Use flash for smoke tests when possible.`;
}

export function AntModelSwitchCallout(props: {
  model: string;
}): React.ReactElement {
  return <Text color={props.model.includes("flash") ? "green" : "yellow"}>{antModelSwitchMessage(props.model)}</Text>;
}
