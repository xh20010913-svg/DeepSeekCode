import type { SelectListOption } from "../design/SelectList.js";

export function option(id: string, label: string, detail = ""): SelectListOption {
  return { id, label, detail };
}
