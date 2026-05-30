import type { SelectListOption } from "../../design/SelectList.js";
import { shellCommandRisk } from "../shellPermissionHelpers.js";

export function bashToolUseOptions(command: string): SelectListOption[] {
  const risk = shellCommandRisk(command);
  return [
    { id: "allow", label: "Allow", detail: `risk ${risk}`, tone: risk === "high" ? "warning" : "success" },
    { id: "reject", label: "Reject", detail: "do not run command", tone: "error" },
  ];
}
