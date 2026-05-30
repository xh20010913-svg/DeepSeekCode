import React from "react";
import { Text } from "ink";

export function permissionRuleExplanation(rule: string): string {
  return rule.trim() ? `Rule: ${rule.trim()}` : "No rule selected";
}

export function PermissionRuleExplanation(props: { rule: string }): React.ReactElement {
  return <Text color="gray">{permissionRuleExplanation(props.rule)}</Text>;
}
