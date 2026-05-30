import fs from "node:fs";
import { discoverAgents, type AgentSummary } from "./discovery.js";
import { parseAgentDocument, type AgentFrontmatter } from "./manifest.js";

export interface LoadedAgent extends AgentSummary {
  frontmatter: AgentFrontmatter;
  prompt: string;
  model: string;
  tools?: string[];
  skills?: string[];
}

export function loadAgent(projectPath: string, dataDir: string, name: string): LoadedAgent | null {
  const agent = discoverAgents(projectPath, dataDir).find((candidate) => candidate.name === name);
  if (!agent) return null;
  const parsed = parseAgentDocument(fs.readFileSync(agent.path, "utf8"));
  return {
    ...agent,
    frontmatter: parsed.frontmatter,
    prompt: parsed.body,
    model: parsed.frontmatter.model ?? "inherit",
    tools: parsed.frontmatter.tools,
    skills: parsed.frontmatter.skills,
  };
}
