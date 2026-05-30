import React from "react";
import { Text } from "ink";

export function SkillPermissionRequest(props: { skill: string }): React.ReactElement {
  return <Text color="yellow">skill permission: {props.skill}</Text>;
}
