import { shellPermissionLabel } from "./shellPermissionHelpers.js";

export function useShellPermissionFeedback(enabled: boolean): string {
  return shellPermissionLabel(enabled);
}
