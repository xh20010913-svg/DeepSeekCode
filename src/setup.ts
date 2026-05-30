import fs from "node:fs";
import path from "node:path";
import type { RuntimeConfig } from "./bootstrap/config.js";

export interface SetupCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export function runSetupChecks(config: RuntimeConfig): SetupCheck[] {
  return [
    {
      name: "project",
      ok: fs.existsSync(config.projectPath),
      detail: config.projectPath,
    },
    {
      name: "data_dir",
      ok: fs.existsSync(config.dataDir),
      detail: config.dataDir,
    },
    {
      name: "state_dir",
      ok: fs.existsSync(path.dirname(config.stateDbPath)),
      detail: path.dirname(config.stateDbPath),
    },
    {
      name: "provider",
      ok: Boolean(config.provider),
      detail: config.provider ? `${config.provider.name} ${config.provider.model}` : "missing DEEPSEEK_API_KEY",
    },
  ];
}
