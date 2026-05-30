import path from "node:path";
import type { SelectListOption } from "../design/SelectList.js";
import { normalizeAgentComponentName } from "./utils.js";

export function agentMarkdownFilename(name: string): string {
  const normalized = normalizeAgentComponentName(name) || "agent";
  return `${normalized}.md`;
}

export function agentPathLabel(agentPath: string, projectPath?: string): string {
  if (!agentPath) return "";
  const normalizedPath = path.resolve(agentPath);
  if (projectPath) {
    const projectRelative = relativeInside(path.resolve(projectPath), normalizedPath);
    if (projectRelative) return path.join(".", projectRelative);
  }
  const home = process.env.USERPROFILE ?? process.env.HOME;
  if (home) {
    const homeRelative = relativeInside(path.resolve(home), normalizedPath);
    if (homeRelative) return path.join("~", homeRelative);
  }
  const parts = normalizedPath.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 4) return normalizedPath;
  return path.join("...", ...parts.slice(-3));
}

export function agentLocationOptions(input: {
  projectPath: string;
  userAgentsPath?: string;
  selected?: "project" | "user";
}): SelectListOption[] {
  const projectAgents = path.join(input.projectPath, ".deepseekcode", "agents");
  const userAgents = input.userAgentsPath ?? path.join(process.env.USERPROFILE ?? process.env.HOME ?? "~", ".deepseekcode", "agents");
  return [
    {
      id: "project",
      label: "Project",
      detail: agentPathLabel(projectAgents, input.projectPath),
      description: "Share this agent with the current DeepSeekCode workspace.",
      selected: input.selected !== "user",
      tone: "success",
    },
    {
      id: "user",
      label: "User",
      detail: agentPathLabel(userAgents, input.projectPath),
      description: "Keep this agent available across local projects.",
      selected: input.selected === "user",
      tone: "brand",
    },
  ];
}

function relativeInside(root: string, target: string): string | null {
  const relative = path.relative(root, target);
  if (!relative || relative === ".") return "";
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return relative;
}
