import { createUtilityAdapter } from "../compat.js";

export const referenceUtilityPath = "nativeInstaller/download.ts";
export const utilityAdapter = createUtilityAdapter(referenceUtilityPath);
export const utilityCompatibility = utilityAdapter.info;
export function status() {
  return utilityAdapter.status();
}
export function unavailable(operation?: string) {
  return utilityAdapter.unavailable(operation);
}
export default utilityAdapter;
export * from "../compat.js";
