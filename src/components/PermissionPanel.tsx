import React from "react";
import { Box, Text } from "ink";
import {
  inferProfile,
  listPermissionProfiles,
  type PermissionProfile,
  type RuntimePermissionState,
} from "../services/permissions/permissionProfiles.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { SelectList, type SelectListOption } from "./design/SelectList.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { Tabs } from "./design/Tabs.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";
import { PermissionRiskCallout } from "./PermissionRiskCallout.js";

export interface PermissionPanelModel {
  currentProfile: string;
  shell: "on" | "off";
  browser: "on" | "off";
  rows: PermissionProfileRow[];
}

export interface PermissionProfileRow {
  name: string;
  active: boolean;
  shell: "on" | "off";
  browser: "on" | "off";
  description: string;
}

export function PermissionPanel(props: {
  state: RuntimePermissionState;
  profiles?: PermissionProfile[];
  title?: string;
}): React.ReactElement {
  const model = permissionPanelModel(props.state, props.profiles ?? listPermissionProfiles());
  const { columns } = useTerminalSize();
  const width = Math.max(58, Math.min(112, columns - 4));
  const profileOptions = permissionPanelProfileOptions(model);
  const selectedProfileIndex = Math.max(0, profileOptions.findIndex((option) => option.selected));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="permissions" tone={permissionTone(model)} paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.title ?? "Permissions"}</Text>
            <Text color="gray">{truncateCells(`shell ${model.shell} | browser ${model.browser}`, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={model.currentProfile} tone={permissionTone(model)} />
        </Box>
        <Box marginTop={1}>
          <Tabs
            title="view"
            selectedId="profiles"
            tabs={[
              { id: "profiles", title: "profiles", count: model.rows.length, tone: "brand" },
              { id: "rules", title: "rules", tone: "muted" },
              { id: "approval", title: "approval", tone: "muted" },
            ]}
            width={width}
          />
        </Box>
        <Box flexDirection="column" marginTop={1}>
          <PermissionRow label="profile" value={model.currentProfile} tone={permissionTone(model)} />
          <PermissionRow label="shell" value={model.shell} tone={model.shell === "on" ? "warning" : "success"} />
          <PermissionRow label="browser" value={model.browser} tone={model.browser === "on" ? "warning" : "success"} />
        </Box>
        <Box marginTop={1}>
          <PermissionRiskCallout state={props.state} />
        </Box>
        <Box marginTop={1}>
          <Text color="gray">profiles</Text>
        </Box>
        <SelectList options={profileOptions} selectedIndex={selectedProfileIndex} visibleCount={6} width={width} />
        <Box marginTop={1}>
          <Text color="gray">commands</Text>
        </Box>
        <SelectList options={permissionPanelCommandOptions()} selectedIndex={0} visibleCount={4} width={width} />
        <Text color="gray">/permissions profile dev | /permissions profile safe | /approval policy on</Text>
      </Pane>
    </Box>
  );
}

export function permissionPanelModel(
  state: RuntimePermissionState,
  profiles = listPermissionProfiles(),
): PermissionPanelModel {
  const currentProfile = state.profile ?? inferProfile(state);
  return {
    currentProfile,
    shell: state.allowShell ? "on" : "off",
    browser: state.allowBrowser ? "on" : "off",
    rows: profiles.map((profile) => ({
      name: profile.name,
      active: currentProfile === profile.name,
      shell: profile.allowShell ? "on" : "off",
      browser: profile.allowBrowser ? "on" : "off",
      description: profile.description,
    })),
  };
}

export function permissionPanelProfileOptions(model: PermissionPanelModel): SelectListOption[] {
  const options = model.rows.map((row) => ({
    id: row.name,
    label: row.name,
    detail: `shell ${row.shell} | browser ${row.browser}`,
    description: row.description,
    selected: row.active,
    tone: row.active ? "brand" as const : row.name === "open" ? "warning" as const : "muted" as const,
  }));
  if (model.currentProfile === "custom" && !options.some((option) => option.selected)) {
    return [{
      id: "custom",
      label: "custom",
      detail: `shell ${model.shell} | browser ${model.browser}`,
      description: "manual runtime override; not one of the built-in profiles",
      selected: true,
      tone: "warning",
    }, ...options];
  }
  return options;
}

export function permissionPanelCommandOptions(): SelectListOption[] {
  return [
    {
      id: "safe",
      label: "safe",
      detail: "/permissions profile safe",
      description: "disable shell and browser actions",
      tone: "success",
    },
    {
      id: "dev",
      label: "dev",
      detail: "/permissions profile dev",
      description: "allow local shell while keeping browser off",
      tone: "brand",
    },
    {
      id: "browser",
      label: "browser",
      detail: "/permissions profile browser",
      description: "allow browser actions without shell",
      tone: "brand",
    },
    {
      id: "open",
      label: "open",
      detail: "/permissions profile open",
      description: "allow shell and browser; use only in trusted workspaces",
      tone: "warning",
    },
  ];
}

function PermissionRow(props: {
  label: string;
  value: string;
  tone?: TerminalTone;
}): React.ReactElement {
  return (
    <Box flexDirection="row">
      <StatusBadge label={props.label} tone={props.tone ?? "muted"} />
      <Text> </Text>
      <Text color="gray">{props.value}</Text>
    </Box>
  );
}

function permissionTone(model: PermissionPanelModel): TerminalTone {
  if (model.currentProfile === "open") return "warning";
  if (model.shell === "on" || model.browser === "on") return "brand";
  if (model.currentProfile === "custom") return "warning";
  return "success";
}
