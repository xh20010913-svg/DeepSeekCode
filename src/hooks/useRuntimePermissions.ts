import { useMemo, useState } from "react";
import type { RuntimePermissionState } from "../services/permissions/permissionProfiles.js";

export function useRuntimePermissions(initial: RuntimePermissionState): {
  permissions: RuntimePermissionState;
  setShell(value: boolean): void;
  setBrowser(value: boolean): void;
  toggleShell(): void;
  toggleBrowser(): void;
} {
  const [permissions, setPermissions] = useState(initial);
  return useMemo(() => ({
    permissions,
    setShell(value: boolean) {
      setPermissions((previous) => ({ ...previous, allowShell: value, profile: "custom" }));
    },
    setBrowser(value: boolean) {
      setPermissions((previous) => ({ ...previous, allowBrowser: value, profile: "custom" }));
    },
    toggleShell() {
      setPermissions((previous) => ({ ...previous, allowShell: !previous.allowShell, profile: "custom" }));
    },
    toggleBrowser() {
      setPermissions((previous) => ({ ...previous, allowBrowser: !previous.allowBrowser, profile: "custom" }));
    },
  }), [permissions]);
}
