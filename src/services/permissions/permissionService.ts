import type { ToolPermissionContext } from "../../Tool.js";
import { describePolicy, type PermissionPolicy } from "../../utils/permissions/policy.js";
import { getPermissionProfile, type PermissionProfileName } from "./permissionProfiles.js";

export class PermissionService {
  constructor(private policy: PermissionPolicy) {}

  toToolContext(root: string): ToolPermissionContext {
    return {
      root,
      allowShell: this.policy.allowShell,
      allowBrowser: this.policy.allowBrowser,
    };
  }

  update(update: Partial<PermissionPolicy>): PermissionPolicy {
    this.policy = { ...this.policy, ...update };
    return this.snapshot();
  }

  applyProfile(name: PermissionProfileName): PermissionPolicy {
    const profile = getPermissionProfile(name);
    if (!profile) throw new Error(`Unknown permission profile: ${name}`);
    this.policy = {
      ...this.policy,
      allowShell: profile.allowShell,
      allowBrowser: profile.allowBrowser,
    };
    return this.snapshot();
  }

  snapshot(): PermissionPolicy {
    return { ...this.policy };
  }

  describe(): string {
    return describePolicy(this.policy);
  }
}
