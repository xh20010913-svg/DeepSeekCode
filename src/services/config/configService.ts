import type { RuntimeConfig } from "../../bootstrap/config.js";
import { readGlobalConfig, saveGlobalConfig, type DeepSeekCodeConfig } from "../../utils/config.js";

export class ConfigService {
  constructor(private readonly runtime: RuntimeConfig) {}

  read(): DeepSeekCodeConfig {
    return readGlobalConfig(this.runtime.dataDir);
  }

  update(update: Partial<DeepSeekCodeConfig>): DeepSeekCodeConfig {
    const next = { ...this.read(), ...update };
    saveGlobalConfig(this.runtime.dataDir, next);
    return next;
  }
}
