import fs from "node:fs";
import path from "node:path";
import { firstSkillDescription } from "./manifest.js";

export interface SkillSummary {
  name: string;
  path: string;
  scope: "project" | "user" | "cache";
  description: string;
}

export function discoverSkills(projectPath: string, dataDir: string): SkillSummary[] {
  const userHome = process.env.USERPROFILE ?? process.env.HOME ?? "";
  const roots: Array<{ scope: SkillSummary["scope"]; dir: string }> = [
    { scope: "project", dir: path.join(projectPath, ".deepseekcode", "skills") },
    { scope: "user", dir: userHome ? path.join(userHome, ".deepseekcode", "skills") : "" },
    { scope: "cache", dir: path.join(dataDir, "cache", "skills") },
  ];

  const skills: SkillSummary[] = [];
  for (const root of roots) {
    if (!root.dir || !fs.existsSync(root.dir)) continue;
    for (const entry of fs.readdirSync(root.dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillDir = path.join(root.dir, entry.name);
      const skillMd = path.join(skillDir, "SKILL.md");
      const description = fs.existsSync(skillMd)
        ? firstSkillDescription(fs.readFileSync(skillMd, "utf8"))
        : "";
      skills.push({
        name: entry.name,
        path: skillDir,
        scope: root.scope,
        description,
      });
    }
  }
  return skills.sort((a, b) => `${a.scope}:${a.name}`.localeCompare(`${b.scope}:${b.name}`));
}
