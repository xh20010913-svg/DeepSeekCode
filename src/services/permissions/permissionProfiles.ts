export const permissionProfileNames = ["safe", "dev", "browser", "open"] as const;

export type PermissionProfileName = (typeof permissionProfileNames)[number];
export type RuntimePermissionProfile = PermissionProfileName | "custom";

export interface RuntimePermissionState {
  allowShell: boolean;
  allowBrowser: boolean;
  profile?: RuntimePermissionProfile;
}

export interface PermissionProfile {
  name: PermissionProfileName;
  description: string;
  allowShell: boolean;
  allowBrowser: boolean;
}

const profiles: Record<PermissionProfileName, PermissionProfile> = {
  safe: {
    name: "safe",
    description: "Read, edit, and validate project files while keeping shell and browser control off.",
    allowShell: false,
    allowBrowser: false,
  },
  dev: {
    name: "dev",
    description: "Enable local shell commands for builds and tests; browser control stays off.",
    allowShell: true,
    allowBrowser: false,
  },
  browser: {
    name: "browser",
    description: "Enable browser/CDP actions for UI checks; shell execution stays off.",
    allowShell: false,
    allowBrowser: true,
  },
  open: {
    name: "open",
    description: "Enable shell and browser actions for trusted local development sessions.",
    allowShell: true,
    allowBrowser: true,
  },
};

const modeAliases: Record<string, PermissionProfileName> = {
  default: "safe",
  plan: "safe",
  acceptEdits: "dev",
  acceptedits: "dev",
  dontAsk: "open",
  dontask: "open",
  bypassPermissions: "open",
  bypasspermissions: "open",
};

export function listPermissionProfiles(): PermissionProfile[] {
  return permissionProfileNames.map((name) => profiles[name]);
}

export function getPermissionProfile(name: string): PermissionProfile | null {
  const normalized = normalizeProfileName(name);
  return normalized ? profiles[normalized] : null;
}

export function normalizeProfileName(name: string): PermissionProfileName | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (isPermissionProfileName(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  const alias = modeAliases[trimmed] ?? modeAliases[lower];
  return alias ?? null;
}

export function applyPermissionProfile(
  state: RuntimePermissionState,
  name: string,
): RuntimePermissionState {
  const profile = getPermissionProfile(name);
  if (!profile) {
    throw new Error(`Unknown permission profile: ${name}`);
  }
  state.allowShell = profile.allowShell;
  state.allowBrowser = profile.allowBrowser;
  state.profile = profile.name;
  return state;
}

export function markCustomPermissions(state: RuntimePermissionState): RuntimePermissionState {
  state.profile = "custom";
  return state;
}

export function describeRuntimePermissions(state: RuntimePermissionState): string {
  return [
    `profile: ${state.profile ?? inferProfile(state)}`,
    `shell: ${state.allowShell ? "on" : "off"}`,
    `browser: ${state.allowBrowser ? "on" : "off"}`,
  ].join("\n");
}

export function inferProfile(state: RuntimePermissionState): RuntimePermissionProfile {
  const match = listPermissionProfiles().find(
    (profile) =>
      profile.allowShell === state.allowShell &&
      profile.allowBrowser === state.allowBrowser,
  );
  return match?.name ?? "custom";
}

function isPermissionProfileName(value: string): value is PermissionProfileName {
  return permissionProfileNames.includes(value as PermissionProfileName);
}
