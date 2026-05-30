import { truncatePromptForFooter } from "./utils.js";

export function useMaybeTruncateInput(value: string, width: number): string {
  return truncatePromptForFooter(value, width);
}
