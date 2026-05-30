import { baseTools } from "./tools/registry.js";
import type { Tools } from "./Tool.js";

export function getTools(): Tools {
  return [...baseTools];
}

export function assembleToolPool(extraTools: Tools = []): Tools {
  const byName = new Map(baseTools.map((tool) => [tool.name, tool]));
  for (const tool of extraTools) byName.set(tool.name, tool);
  return [...byName.values()];
}
