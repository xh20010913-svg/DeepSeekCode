import { createServiceAdapter } from "../compat.js";

export const referenceServicePath = "MagicDocs/magicDocs.ts";
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
