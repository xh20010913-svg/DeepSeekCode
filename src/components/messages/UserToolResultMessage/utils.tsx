export function userToolResultStatus(text: string): "success" | "error" | "rejected" {
  if (/reject|denied|cancel/i.test(text)) return "rejected";
  if (/error|failed|exception/i.test(text)) return "error";
  return "success";
}
