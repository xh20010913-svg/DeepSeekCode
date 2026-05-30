import React from "react";
import { Text } from "ink";

export function issueFlagBannerText(hasIssue: boolean): string {
  return hasIssue ? "Input issue detected; run /doctor if typing behaves strangely." : "";
}

export function IssueFlagBanner(props: {
  hasIssue: boolean;
}): React.ReactElement | null {
  const text = issueFlagBannerText(props.hasIssue);
  return text ? <Text color="yellow">{text}</Text> : null;
}
