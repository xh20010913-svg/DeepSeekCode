import type { SelectListOption } from "../../design/SelectList.js";

export function filePermissionOptions(destructive: boolean): SelectListOption[] {
  return [
    { id: "allow", label: "Allow edit", detail: destructive ? "destructive" : "safe edit", tone: destructive ? "warning" : "success" },
    { id: "reject", label: "Reject", detail: "leave file unchanged", tone: "error" },
  ];
}
