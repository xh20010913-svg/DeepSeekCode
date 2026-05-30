import { createServiceAdapter } from "../compat.js";

export const referenceServicePath = "mcp/normalization.ts";
export const serviceAdapter = createServiceAdapter(referenceServicePath);
export const serviceCompatibility = serviceAdapter.info;
export function status() {
  return serviceAdapter.status();
}
export function unsupported(operation?: string) {
  return serviceAdapter.unsupported(operation);
}
export default serviceAdapter;
export * from "../compat.js";
