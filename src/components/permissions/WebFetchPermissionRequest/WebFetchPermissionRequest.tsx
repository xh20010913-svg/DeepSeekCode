import React from "react";
import { Text } from "ink";

export function WebFetchPermissionRequest(props: { url: string }): React.ReactElement {
  return <Text color="yellow">web fetch permission: {props.url}</Text>;
}
