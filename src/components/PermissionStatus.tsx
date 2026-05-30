import React from "react";
import { Text } from "ink";
import { inferProfile, type RuntimePermissionState } from "../services/permissions/permissionProfiles.js";

export function PermissionStatus(props: RuntimePermissionState): React.ReactElement {
  const profile = props.profile ?? inferProfile(props);
  return (
    <Text color="gray">
      {`${profile} | shell ${props.allowShell ? "on" : "off"} | browser ${props.allowBrowser ? "on" : "off"}`}
    </Text>
  );
}
