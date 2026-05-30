import fs from "node:fs";
import path from "node:path";
import { discoverSkills, type SkillSummary } from "./discovery.js";
import { parseSkillDocument, type SkillFrontmatter } from "./manifest.js";

export interface LoadedSkill extends SkillSummary {
  prompt: string;
  frontmatter: SkillFrontmatter;
  manifest?: unknown;
}

export function loadSkill(projectPath: string, dataDir: string, name: string): LoadedSkill | null {
  const skill = discoverSkills(projectPath, dataDir).find((candidate) => candidate.name === name);
  if (!skill) return null;
  const skillMd = path.join(skill.path, "SKILL.md");
  const manifestJson = path.join(skill.path, "skill.json");
  const prompt = fs.existsSync(skillMd) ? fs.readFileSync(skillMd, "utf8") : "";
  const parsed = parseSkillDocument(prompt);
  return {
    ...skill,
    prompt,
    frontmatter: parsed.frontmatter,
    manifest: fs.existsSync(manifestJson)
      ? JSON.parse(fs.readFileSync(manifestJson, "utf8"))
      : undefined,
  };
}
