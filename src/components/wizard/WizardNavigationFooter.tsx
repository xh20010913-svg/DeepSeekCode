import React from "react";
import { Text } from "ink";

export function wizardNavigationText(index: number, count: number): string {
  return `${Math.max(1, index + 1)}/${Math.max(1, count)}  enter next | esc back`;
}

export function WizardNavigationFooter(props: { index: number; count: number }): React.ReactElement {
  return <Text color="gray">{wizardNavigationText(props.index, props.count)}</Text>;
}
