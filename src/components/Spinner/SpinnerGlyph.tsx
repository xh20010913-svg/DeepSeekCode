import React from "react";
import { Text } from "ink";
import { spinnerFrame } from "./utils.js";

export function SpinnerGlyph(props: { frame: number }): React.ReactElement {
  return <Text color="cyan">{spinnerFrame(props.frame)}</Text>;
}
