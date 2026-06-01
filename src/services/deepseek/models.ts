export interface DeepSeekModelOption {
  id: string;
  label: string;
  status: string;
  detail: string;
  description: string;
}

export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

export const DEEPSEEK_MODEL_OPTIONS: DeepSeekModelOption[] = [
  {
    id: "deepseek-v4-flash",
    label: "deepseek-v4-flash",
    status: "flash",
    detail: "fast local testing, lower token burn",
    description: "Use this for routine validation, UI checks, and cheaper end-to-end tests.",
  },
  {
    id: "deepseek-v4-pro",
    label: "deepseek-v4-pro",
    status: "pro",
    detail: "stronger reasoning, higher token spend",
    description: "Use this for harder planning, debugging, and realistic agent capability checks.",
  },
];

export function resolveDeepSeekModelSelection(input: string): string | null {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "flash" || normalized === "v4-flash") return "deepseek-v4-flash";
  if (normalized === "pro" || normalized === "v4-pro") return "deepseek-v4-pro";
  return DEEPSEEK_MODEL_OPTIONS.some((option) => option.id === normalized)
    ? normalized
    : null;
}

export function deepSeekModelOptionById(model: string): DeepSeekModelOption | undefined {
  return DEEPSEEK_MODEL_OPTIONS.find((option) => option.id === model);
}
