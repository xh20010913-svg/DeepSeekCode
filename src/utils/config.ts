import fs from "node:fs";
import path from "node:path";

export interface DeepSeekCodeConfig {
  defaultModel?: string;
  requireValidationApproval?: boolean;
  disabledSkills?: string[];
  disabledPlugins?: string[];
}

export function configPath(dataDir: string): string {
  return path.join(dataDir, "config", "deepseekcode.json");
}

export function readGlobalConfig(dataDir: string): DeepSeekCodeConfig {
  const file = configPath(dataDir);
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8")) as DeepSeekCodeConfig;
}

export function saveGlobalConfig(dataDir: string, config: DeepSeekCodeConfig): void {
  const file = configPath(dataDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
