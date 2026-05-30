import React from "react";
import { Box } from "ink";
import { TeammateSpinnerLine } from "./TeammateSpinnerLine.js";

export function TeammateSpinnerTree(props: { names: readonly string[]; activeIndex?: number }): React.ReactElement {
  return (
    <Box flexDirection="column">
      {props.names.map((name, index) => (
        <TeammateSpinnerLine key={name} name={name} active={index === props.activeIndex} />
      ))}
    </Box>
  );
}
