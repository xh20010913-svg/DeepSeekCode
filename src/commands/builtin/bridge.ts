import type { Command } from "../../types/command.js";
import { listBridgeCapabilities } from "../../bridge/index.js";

export const bridgeCommand: Command = {
  name: "bridge",
  description: "List browser/computer bridge capabilities.",
  execute() {
    return {
      message: listBridgeCapabilities()
        .map((capability) => `${capability.name}: ${capability.enabled ? "enabled" : "disabled"} - ${capability.description}`)
        .join("\n"),
    };
  },
};
