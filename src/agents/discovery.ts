import fs from "node:fs";
import path from "node:path";
import { normalizeAgentName, parseAgentDocument } from "./manifest.js";
import { pluginExtensionDirs } from "../plugins/extensions.js";

export interface AgentSummary {
  name: string;
  path: string;
  scope: "project" | "user" | "cache" | "plugin";
  description: string;
}

export function discoverAgents(projectPath: string, dataDir: string): AgentSummary[] {
  const userHome = process.env.USERPROFILE ?? process.env.HOME ?? "";
  const roots: Array<{ scope: AgentSummary["scope"]; dir: string }> = [
    { scope: "project", dir: path.join(projectPath, ".deepseekcode", "agents") },
    { scope: "user", dir: userHome ? path.join(userHome, ".deepseekcode", "agents") : "" },
    { scope: "cache", dir: path.join(dataDir, "cache", "agents") },
  ];
  const agents: AgentSummary[] = [];
  for (const root of roots) {
    if (!root.dir || !fs.existsSync(root.dir)) continue;
    for (const entry of fs.readdirSync(root.dir, { withFileTypes: true })) {
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".md") continue;
      const fullPath = path.join(root.dir, entry.name);
      const name = path.basename(entry.name, ".md");
      const content = fs.readFileSync(fullPath, "utf8");
      const parsed = parseAgentDocument(content);
      agents.push({
        name,
        path: fullPath,
        scope: root.scope,
        description: parsed.frontmatter.description ?? parsed.frontmatter.whenToUse ?? firstUsefulLine(parsed.body),
      });
    }
  }
  for (const root of pluginExtensionDirs(projectPath, dataDir, "agents")) {
    for (const entry of fs.readdirSync(root.path, { withFileTypes: true })) {
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".md") continue;
      const fullPath = path.join(root.path, entry.name);
      const name = `${root.plugin.name}:${normalizeAgentName(path.basename(entry.name, ".md"))}`;
      const content = fs.readFileSync(fullPath, "utf8");
      const parsed = parseAgentDocument(content);
      agents.push({
        name,
        path: fullPath,
        scope: "plugin",
        description: parsed.frontmatter.description ?? parsed.frontmatter.whenToUse ?? firstUsefulLine(parsed.body),
      });
    }
  }
  return agents.sort((a, b) => `${a.scope}:${a.name}`.localeCompare(`${b.scope}:${b.name}`));
}

function firstUsefulLine(content: string): string {
  return (
    content
      .split(/\r?\n/)
      .map((line) => line.replace(/^#+\s*/, "").trim())
      .find((line) => line && !line.startsWith("---")) ?? ""
  );
}
