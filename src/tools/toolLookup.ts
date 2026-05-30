import type { Tool } from "../Tool.js";
import { baseTools } from "./registry.js";

export function getToolByName(name: string): Tool {
  const tool = baseTools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return tool;
}

export function getOptionalToolByName(name: string): Tool | undefined {
  return baseTools.find((candidate) => candidate.name === name);
}
