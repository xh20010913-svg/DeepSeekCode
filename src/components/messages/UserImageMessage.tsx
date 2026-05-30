import React from "react";
import { Text } from "ink";

export function userImageLabel(path: string): string {
  return `image: ${path.trim() || "attached"}`;
}

export function UserImageMessage(props: { path: string }): React.ReactElement {
  return <Text color="gray">{userImageLabel(props.path)}</Text>;
}
