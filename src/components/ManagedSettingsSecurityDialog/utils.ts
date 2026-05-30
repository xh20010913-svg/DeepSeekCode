export function managedSettingsSecurityLabel(managed: boolean): string {
  return managed ? "managed settings active" : "local settings";
}
