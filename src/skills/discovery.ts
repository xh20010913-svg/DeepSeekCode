import fs from "node:fs";
import path from "node:path";
import { pluginExtensionDirs } from "../plugins/extensions.js";
import { DOCUMENTS_SKILL, PRESENTATIONS_SKILL } from "./bundled/officeSkillContent.js";
import { firstSkillDescription } from "./manifest.js";

export interface SkillSummary {
  name: string;
  path: string;
  scope: "project" | "user" | "cache" | "plugin";
  description: string;
}

export function discoverSkills(projectPath: string, dataDir: string): SkillSummary[] {
  const userHome = process.env.USERPROFILE ?? process.env.HOME ?? "";
  const roots: Array<{ scope: SkillSummary["scope"]; dir: string }> = [
    { scope: "project", dir: path.join(projectPath, ".deepseekcode", "skills") },
    { scope: "project", dir: path.join(projectPath, ".claude", "skills") },
    { scope: "user", dir: userHome ? path.join(userHome, ".deepseekcode", "skills") : "" },
    { scope: "user", dir: userHome ? path.join(userHome, ".claude", "skills") : "" },
    { scope: "cache", dir: path.join(dataDir, "cache", "skills") },
  ];

  const skills: SkillSummary[] = bundledRuntimeSkills();
  const seenNames = new Set<string>();
  for (const skill of skills) seenNames.add(skill.name);
  for (const root of roots) {
    if (!root.dir || !fs.existsSync(root.dir)) continue;
    for (const entry of fs.readdirSync(root.dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (seenNames.has(entry.name)) continue;
      const skillDir = path.join(root.dir, entry.name);
      const skillMd = path.join(skillDir, "SKILL.md");
      const description = fs.existsSync(skillMd)
        ? firstSkillDescription(fs.readFileSync(skillMd, "utf8"))
        : "";
      seenNames.add(entry.name);
      skills.push({
        name: entry.name,
        path: skillDir,
        scope: root.scope,
        description,
      });
    }
  }
  for (const extension of pluginExtensionDirs(projectPath, dataDir, "skills")) {
    if (!fs.existsSync(extension.path)) continue;
    for (const entry of fs.readdirSync(extension.path, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (seenNames.has(entry.name)) continue;
      const skillDir = path.join(extension.path, entry.name);
      const skillMd = path.join(skillDir, "SKILL.md");
      const description = fs.existsSync(skillMd)
        ? firstSkillDescription(fs.readFileSync(skillMd, "utf8"))
        : "";
      seenNames.add(entry.name);
      skills.push({
        name: entry.name,
        path: skillDir,
        scope: "plugin",
        description,
      });
    }
  }
  return skills.sort((a, b) => scopeOrder(a.scope) - scopeOrder(b.scope) || a.name.localeCompare(b.name));
}

export function bundledRuntimeSkillContent(name: string): string | undefined {
  if (name === "documents") return DOCUMENTS_SKILL;
  if (name === "presentations") return PRESENTATIONS_SKILL;
  return undefined;
}

function bundledRuntimeSkills(): SkillSummary[] {
  return [
    {
      name: "documents",
      path: "builtin:documents",
      scope: "cache",
      description: firstSkillDescription(DOCUMENTS_SKILL),
    },
    {
      name: "presentations",
      path: "builtin:presentations",
      scope: "cache",
      description: firstSkillDescription(PRESENTATIONS_SKILL),
    },
  ];
}

function scopeOrder(scope: SkillSummary["scope"]): number {
  if (scope === "project") return 0;
  if (scope === "user") return 1;
  if (scope === "plugin") return 2;
  return 3;
}
