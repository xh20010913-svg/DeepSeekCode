import React from "react";
import { Box, Text } from "ink";
import type { RuntimePermissionState } from "../services/permissions/permissionProfiles.js";

export interface PermissionRiskModel {
  level: "low" | "medium" | "high";
  title: string;
  detail: string;
  color: string;
}

export function PermissionRiskCallout(props: {
  state: RuntimePermissionState;
}): React.ReactElement {
  const model = permissionRiskModel(props.state);
  return (
    <Box flexDirection="column">
      <Text color={model.color}>{model.title}</Text>
      <Text color="gray">{model.detail}</Text>
    </Box>
  );
}

export function permissionRiskModel(state: RuntimePermissionState): PermissionRiskModel {
  if (state.allowShell && state.allowBrowser) {
    return {
      level: "high",
      title: "High trust mode",
      detail: "Shell and browser control are both enabled. Use this only in trusted local projects.",
      color: "yellow",
    };
  }
  if (state.allowShell) {
    return {
      level: "medium",
      title: "Shell enabled",
      detail: "Local commands can run builds, tests, and scripts from the selected project.",
      color: "yellow",
    };
  }
  if (state.allowBrowser) {
    return {
      level: "medium",
      title: "Browser enabled",
      detail: "Browser/CDP actions can inspect and interact with configured pages.",
      color: "yellow",
    };
  }
  return {
    level: "low",
    title: "Safe profile",
    detail: "Shell and browser control are off; file and validation workflows remain available.",
    color: "green",
  };
}
