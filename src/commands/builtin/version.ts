import type { Command } from "../../types/command.js";
import { formatVersion, readVersionInfo } from "../../services/version/versionService.js";

export const versionCommand: Command = {
  name: "version",
  description: "Print the DeepSeekCode version for this runtime.",
  execute() {
    return { message: formatVersion(readVersionInfo()) };
  },
};
