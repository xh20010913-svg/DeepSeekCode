import fs from "node:fs";
import path from "node:path";
import { bundledRuntimeSkillContent, discoverSkills, type SkillSummary } from "../../skills/discovery.js";
import { loadSkill, type LoadedSkill } from "../../skills/loader.js";
import {
  normalizeSkillName,
  parseSkillDocument,
  renderSkillDocument,
  validateSkillDocument,
  type SkillValidationResult,
} from "../../skills/manifest.js";
import { resolveInstallSource } from "../install/installSource.js";

export interface SkillSourceMetadata {
  kind: "path" | "git";
  sourcePath: string;
  sourceUrl?: string;
  ref?: string;
  subpath?: string;
  installedAtMs: number;
  updatedAtMs?: number;
}

export interface SkillSearchResult {
  name: string;
  scope: SkillSummary["scope"];
  path: string;
  description: string;
  disableModelInvocation: boolean;
  source?: SkillSourceMetadata;
}

export class SkillService {
  constructor(
    private readonly projectPath: string,
    private readonly dataDir: string,
  ) {}

  list(): SkillSummary[] {
    return discoverSkills(this.projectPath, this.dataDir);
  }

  load(name: string): LoadedSkill | null {
    return loadSkill(this.projectPath, this.dataDir, name);
  }

  createProjectSkill(input: {
    name: string;
    description: string;
    body?: string;
    disableModelInvocation?: boolean;
    overwrite?: boolean;
  }): LoadedSkill {
    const name = normalizeSkillName(input.name);
    if (!name) throw new Error("skill name is empty");
    const description = input.description.trim();
    if (!description) throw new Error("skill description is empty");
    const skillDir = path.join(this.projectPath, ".deepseekcode", "skills", name);
    const skillPath = path.join(skillDir, "SKILL.md");
    if (fs.existsSync(skillPath) && !input.overwrite) {
      throw new Error(`skill already exists: ${name}`);
    }
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(skillPath, renderSkillDocument({
      name,
      description,
      body: input.body,
      disableModelInvocation: input.disableModelInvocation,
    }), "utf8");
    const skill = this.load(name);
    if (!skill) throw new Error(`failed to load created skill: ${name}`);
    return skill;
  }

  installFromPath(input: { sourcePath: string; name?: string; overwrite?: boolean }): LoadedSkill {
    const resolvedSource = resolveInstallSource({
      sourcePath: input.sourcePath,
      projectPath: this.projectPath,
      dataDir: this.dataDir,
      cacheNamespace: "skills",
    });
    const candidates = discoverInstallableSkillDirs(resolvedSource.path);
    if (candidates.length === 0) {
      throw new Error(`skill document not found under: ${resolvedSource.path}`);
    }
    const candidate = chooseInstallCandidate(candidates, input.name);
    if (!candidate) {
      throw new Error(`install source contains ${candidates.length} skills; pass a skill name or use installAllFromPath`);
    }
    return this.installSkillDirectory({
      sourcePath: candidate.path,
      sourceRoot: resolvedSource.path,
      sourceMetadata: resolvedSource.metadata,
      name: input.name,
      overwrite: input.overwrite,
    });
  }

  installAllFromPath(input: { sourcePath: string; overwrite?: boolean }): LoadedSkill[] {
    const resolvedSource = resolveInstallSource({
      sourcePath: input.sourcePath,
      projectPath: this.projectPath,
      dataDir: this.dataDir,
      cacheNamespace: "skills",
    });
    const candidates = discoverInstallableSkillDirs(resolvedSource.path);
    if (candidates.length === 0) {
      throw new Error(`skill document not found under: ${resolvedSource.path}`);
    }
    return candidates.map((candidate) => this.installSkillDirectory({
      sourcePath: candidate.path,
      sourceRoot: resolvedSource.path,
      sourceMetadata: resolvedSource.metadata,
      overwrite: input.overwrite,
    }));
  }

  private installSkillDirectory(input: {
    sourcePath: string;
    sourceRoot: string;
    sourceMetadata: Omit<SkillSourceMetadata, "installedAtMs" | "updatedAtMs">;
    name?: string;
    overwrite?: boolean;
  }): LoadedSkill {
    const sourceSkillPath = path.join(input.sourcePath, "SKILL.md");
    if (!fs.existsSync(sourceSkillPath)) {
      throw new Error(`skill document not found: ${sourceSkillPath}`);
    }
    const sourceContent = fs.readFileSync(sourceSkillPath, "utf8");
    const parsed = parseSkillDocument(sourceContent);
    const name = normalizeSkillName(input.name ?? parsed.frontmatter.name ?? path.basename(input.sourcePath));
    if (!name) throw new Error("skill name is empty");
    const skillRoot = path.join(this.projectPath, ".deepseekcode", "skills");
    const targetPath = path.join(skillRoot, name);
    const targetRelative = path.relative(skillRoot, targetPath);
    if (targetRelative.startsWith("..") || path.isAbsolute(targetRelative)) {
      throw new Error(`skill target escapes project skill root: ${targetPath}`);
    }
    if (fs.existsSync(targetPath)) {
      if (!input.overwrite) throw new Error(`skill already exists: ${name}`);
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
    fs.mkdirSync(skillRoot, { recursive: true });
    fs.cpSync(input.sourcePath, targetPath, {
      recursive: true,
      filter: (source) => shouldCopySkillPath(path.relative(input.sourcePath, source)),
    });
    const targetSkillPath = path.join(targetPath, "SKILL.md");
    const targetContent = fs.readFileSync(targetSkillPath, "utf8");
    const targetParsed = parseSkillDocument(targetContent);
    if (targetParsed.frontmatter.name && normalizeSkillName(targetParsed.frontmatter.name) !== name) {
      fs.writeFileSync(targetSkillPath, targetContent.replace(
        /^name\s*:\s*.+$/m,
        `name: ${name}`,
      ), "utf8");
    }
    writeSourceMetadata(targetPath, {
      ...sourceMetadataForSkill(input.sourceMetadata, input.sourceRoot, input.sourcePath),
      installedAtMs: Date.now(),
    });
    const skill = this.load(name);
    if (!skill) throw new Error(`failed to load installed skill: ${name}`);
    return skill;
  }

  uninstall(name: string): string {
    const skill = this.requireProjectSkill(name);
    fs.rmSync(skill.path, { recursive: true, force: true });
    return skill.path;
  }

  search(query: string): SkillSearchResult[] {
    const needle = query.trim().toLowerCase();
    return this.list()
      .map((summary) => this.toSearchResult(summary))
      .filter((result) => {
        if (!needle) return true;
        return [
          result.name,
          result.description,
          result.scope,
          result.disableModelInvocation ? "disable-model-invocation" : "",
        ].join(" ").toLowerCase().includes(needle);
      });
  }

  source(name: string): SkillSourceMetadata | undefined {
    const skill = this.requireSkill(name);
    return readSourceMetadata(skill.path);
  }

  update(name: string): LoadedSkill {
    const skill = this.requireProjectSkill(name);
    const source = readSourceMetadata(skill.path);
    if (!source) throw new Error(`skill has no tracked source: ${name}`);
    const resolvedSource = resolveInstallSource({
      sourcePath: source.sourcePath,
      projectPath: this.projectPath,
      dataDir: this.dataDir,
      cacheNamespace: "skills",
    });
    if (!fs.existsSync(path.join(resolvedSource.path, "SKILL.md"))) {
      throw new Error(`skill source is missing: ${source.sourcePath}`);
    }
    const updated = this.installFromPath({
      sourcePath: source.sourcePath,
      name: skill.name,
      overwrite: true,
    });
    writeSourceMetadata(updated.path, {
      ...source,
      updatedAtMs: Date.now(),
    });
    return updated;
  }

  validate(name?: string): SkillValidationResult[] {
    const skills = name
      ? this.list().filter((candidate) => candidate.name === name)
      : this.list();
    if (name && skills.length === 0) {
      return [{
        name,
        path: "",
        ok: false,
        errors: [`skill not found: ${name}`],
        warnings: [],
      }];
    }
    return skills.map((skill) => {
      const bundled = skill.path.startsWith("builtin:") ? bundledRuntimeSkillContent(skill.name) : undefined;
      if (bundled) {
        return validateSkillDocument(skill.name, skill.path, bundled);
      }
      const skillPath = path.join(skill.path, "SKILL.md");
      return validateSkillDocument(
        skill.name,
        skill.path,
        fs.existsSync(skillPath) ? fs.readFileSync(skillPath, "utf8") : null,
      );
    });
  }

  private requireSkill(name: string): LoadedSkill {
    const skill = this.load(name);
    if (!skill) throw new Error(`Skill not found: ${name}`);
    return skill;
  }

  private requireProjectSkill(name: string): LoadedSkill {
    const skill = this.requireSkill(name);
    if (skill.scope !== "project") throw new Error(`refusing to mutate non-project skill: ${skill.name}`);
    return skill;
  }

  private toSearchResult(summary: SkillSummary): SkillSearchResult {
    const loaded = this.load(summary.name);
    return {
      name: summary.name,
      scope: summary.scope,
      path: summary.path,
      description: summary.description,
      disableModelInvocation: Boolean(loaded?.frontmatter.disableModelInvocation),
      source: readSourceMetadata(summary.path),
    };
  }
}

function shouldCopySkillPath(sourcePath: string): boolean {
  const parts = sourcePath.split(/[\\/]/);
  return !parts.some((part) => ignoredInstallPart(part));
}

interface InstallableSkillDir {
  path: string;
  name: string;
}

function discoverInstallableSkillDirs(root: string): InstallableSkillDir[] {
  if (!fs.existsSync(root)) return [];
  const results: InstallableSkillDir[] = [];
  visitSkillRoot(path.resolve(root), results, 0);
  return results.sort((left, right) => left.name.localeCompare(right.name) || left.path.localeCompare(right.path));
}

function visitSkillRoot(current: string, results: InstallableSkillDir[], depth: number): void {
  if (depth > 8) return;
  const base = path.basename(current);
  if (ignoredInstallPart(base)) return;
  const skillPath = path.join(current, "SKILL.md");
  if (fs.existsSync(skillPath)) {
    const content = fs.readFileSync(skillPath, "utf8");
    const parsed = parseSkillDocument(content);
    const name = normalizeSkillName(parsed.frontmatter.name ?? path.basename(current));
    if (name) {
      results.push({ path: current, name });
    }
    return;
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(current, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (ignoredInstallPart(entry.name)) continue;
    visitSkillRoot(path.join(current, entry.name), results, depth + 1);
  }
}

function chooseInstallCandidate(candidates: InstallableSkillDir[], name: string | undefined): InstallableSkillDir | undefined {
  if (!name) return candidates.length === 1 ? candidates[0] : undefined;
  const normalized = normalizeSkillName(name);
  return candidates.find((candidate) => candidate.name === normalized || normalizeSkillName(path.basename(candidate.path)) === normalized);
}

function sourceMetadataForSkill(
  metadata: Omit<SkillSourceMetadata, "installedAtMs" | "updatedAtMs">,
  sourceRoot: string,
  sourcePath: string,
): Omit<SkillSourceMetadata, "installedAtMs" | "updatedAtMs"> {
  const relative = path.relative(sourceRoot, sourcePath).replace(/\\/g, "/");
  const extraSubpath = relative && relative !== "." ? relative : "";
  return {
    ...metadata,
    subpath: [metadata.subpath, extraSubpath].filter(Boolean).join("/") || metadata.subpath,
  };
}

function ignoredInstallPart(part: string): boolean {
  return part === ".git" ||
    part === "node_modules" ||
    part === ".DS_Store" ||
    part === ".env" ||
    part === "dist" ||
    part === "build" ||
    part === ".deepseekcode";
}

function sourceMetadataPath(skillPath: string): string {
  return path.join(skillPath, ".deepseekcode-source.json");
}

function writeSourceMetadata(skillPath: string, metadata: SkillSourceMetadata): void {
  fs.writeFileSync(sourceMetadataPath(skillPath), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

function readSourceMetadata(skillPath: string): SkillSourceMetadata | undefined {
  const metadataPath = sourceMetadataPath(skillPath);
  if (!fs.existsSync(metadataPath)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as SkillSourceMetadata;
    if (!["path", "git"].includes(parsed.kind) || typeof parsed.sourcePath !== "string") return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}
