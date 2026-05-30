import React from "react";
import { PermissionPanel } from "../../components/PermissionPanel.js";
import type { Command } from "../../types/command.js";
import {
  applyPermissionProfile,
  describeRuntimePermissions,
  listPermissionProfiles,
  markCustomPermissions,
} from "../../services/permissions/permissionProfiles.js";

export const permissionsCommand: Command = {
  name: "permissions",
  aliases: ["perm"],
  description: "Inspect or switch DeepSeekCode runtime permission profiles.",
  usage: "[status|profiles|profile <safe|dev|browser|open>|mode <default|plan|acceptEdits|dontAsk|bypassPermissions>|shell on|off|browser on|off|reset]",
  execute(args, context) {
    const [action = "status", ...rest] = args.trim().split(/\s+/).filter(Boolean);
    if (action === "status") {
      return {
        message: describeRuntimePermissions(context.permissions),
        display: React.createElement(PermissionPanel, { state: context.permissions }),
      };
    }
    if (action === "profiles") {
      const profiles = listPermissionProfiles();
      return {
        message: profiles
          .map((profile) =>
            `${profile.name}: shell=${profile.allowShell ? "on" : "off"} browser=${profile.allowBrowser ? "on" : "off"} - ${profile.description}`,
          )
          .join("\n"),
        display: React.createElement(PermissionPanel, {
          state: context.permissions,
          profiles,
          title: "Permission profiles",
        }),
      };
    }
    if (action === "profile" || action === "mode") {
      const name = rest.join(" ");
      if (!name) return { message: `Usage: /permissions ${action} <name>` };
      try {
        applyPermissionProfile(context.permissions, name);
        return {
          message: [
            `permissions profile: ${context.permissions.profile}`,
            `shell: ${context.permissions.allowShell ? "on" : "off"}`,
            `browser: ${context.permissions.allowBrowser ? "on" : "off"}`,
          ].join("\n"),
          display: React.createElement(PermissionPanel, {
            state: context.permissions,
            title: "Permissions updated",
          }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (action === "shell" || action === "browser") {
      const mode = rest[0];
      if (mode !== "on" && mode !== "off") {
        return { message: `Usage: /permissions ${action} on|off` };
      }
      markCustomPermissions(context.permissions);
      if (action === "shell") context.permissions.allowShell = mode === "on";
      else context.permissions.allowBrowser = mode === "on";
      return {
        message: describeRuntimePermissions(context.permissions),
        display: React.createElement(PermissionPanel, {
          state: context.permissions,
          title: "Permissions updated",
        }),
      };
    }
    if (action === "reset") {
      applyPermissionProfile(context.permissions, "safe");
      return {
        message: describeRuntimePermissions(context.permissions),
        display: React.createElement(PermissionPanel, {
          state: context.permissions,
          title: "Permissions reset",
        }),
      };
    }
    return { message: "Usage: /permissions [status|profiles|profile <name>|mode <name>|shell on|off|browser on|off|reset]" };
  },
};
