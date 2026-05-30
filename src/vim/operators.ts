import { createSourceAdapter } from "../upstreamCompat.js";

export const referenceSourcePath = "vim/operators.ts";
export const sourceAdapter = createSourceAdapter(referenceSourcePath);
export const sourceCompatibility = sourceAdapter.info;
export function status() {
  return sourceAdapter.status();
}
export function unavailable(operation?: string) {
  return sourceAdapter.unavailable(operation);
}
export default sourceAdapter;
export * from "../upstreamCompat.js";
