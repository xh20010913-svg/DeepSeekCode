export interface PermissionPolicy {
  allowShell: boolean;
  allowBrowser: boolean;
  allowDestructiveWrite: boolean;
}

export const defaultPermissionPolicy: PermissionPolicy = {
  allowShell: false,
  allowBrowser: false,
  allowDestructiveWrite: true,
};

export function describePolicy(policy: PermissionPolicy): string {
  return [
    `shell=${policy.allowShell ? "on" : "off"}`,
    `browser=${policy.allowBrowser ? "on" : "off"}`,
    `destructiveWrite=${policy.allowDestructiveWrite ? "on" : "off"}`,
  ].join(" ");
}
