export const PRODUCT_NAME = "DeepSeekCode";
export const DEFAULT_MODEL = "deepseek-v4-flash";
export const DEFAULT_BASE_URL = "https://api.deepseek.com";

export const RUNTIME_MODULES = [
  "bootstrap",
  "cli",
  "components",
  "commands",
  "query",
  "tools",
  "state",
  "tasks",
  "coordinator",
  "context",
  "skills",
  "plugins",
  "services",
  "bridge",
  "keybindings",
  "outputStyles",
] as const;
