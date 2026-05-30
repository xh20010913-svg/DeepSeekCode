import React from "react";
import { ColorPicker, colorPickerOptions } from "../../ColorPicker.js";

export { colorPickerOptions as colorStepOptions };

export function ColorStep(props: {
  color: string;
  width?: number;
}): React.ReactElement {
  return <ColorPicker selectedColor={props.color} width={props.width} />;
}
