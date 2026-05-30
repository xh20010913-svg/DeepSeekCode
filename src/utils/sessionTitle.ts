export function generateSessionTitle(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) return "DeepSeekCode session";
  return normalized.length > 48 ? `${normalized.slice(0, 45)}...` : normalized;
}
