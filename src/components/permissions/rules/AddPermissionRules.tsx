import type { SelectListOption } from "../../design/SelectList.js";

export function addPermissionRuleOptions(scopes: readonly string[]): SelectListOption[] {
  return scopes.map((scope) => ({ id: scope, label: scope, detail: "add rule", tone: "brand" }));
}
