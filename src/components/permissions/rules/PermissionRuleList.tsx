import type { SelectListOption } from "../../design/SelectList.js";

export function permissionRuleListOptions(rules: readonly string[]): SelectListOption[] {
  return rules.map((rule) => ({ id: rule, label: rule, detail: "configured rule", tone: "default" }));
}
