import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface WorkspaceDirectory {
  name: string;
  path: string;
  addedAtMs: number;
}

export type WorkspaceAddResult =
  | { status: "added"; directory: WorkspaceDirectory }
  | { status: "empty" }
  | { status: "not_found"; path: string }
  | { status: "not_directory"; path: string }
  | { status: "already_covered"; path: string; by: string }
  | { status: "overlaps_existing"; path: string; existing: string };

interface WorkspaceConfig {
  directories: WorkspaceDirectory[];
}

export class WorkspaceDirectoryService {
  constructor(private readonly projectPath: string) {}

  list(): WorkspaceDirectory[] {
    return this.readConfig().directories
      .filter((entry) => entry.path && path.isAbsolute(entry.path))
      .map((entry) => ({
        name: normalizeName(entry.name) || defaultName(entry.path),
        path: path.resolve(entry.path),
        addedAtMs: Number(entry.addedAtMs || Date.now()),
      }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  }

  add(inputPath: string): WorkspaceAddResult {
    const trimmed = stripWrappingQuotes(inputPath.trim());
    if (!trimmed) return { status: "empty" };
    const absolutePath = path.resolve(expandHome(trimmed));
    let stats: fs.Stats;
    try {
      stats = fs.statSync(absolutePath);
    } catch {
      return { status: "not_found", path: absolutePath };
    }
    if (!stats.isDirectory()) return { status: "not_directory", path: absolutePath };

    const projectRoot = path.resolve(this.projectPath);
    if (isInsideOrSame(absolutePath, projectRoot)) {
      return { status: "already_covered", path: absolutePath, by: projectRoot };
    }
    const existing = this.list();
    for (const directory of existing) {
      if (isInsideOrSame(absolutePath, directory.path)) {
        return { status: "already_covered", path: absolutePath, by: directory.path };
      }
      if (isInsideOrSame(directory.path, absolutePath)) {
        return { status: "overlaps_existing", path: absolutePath, existing: directory.path };
      }
    }

    const directory = {
      name: uniqueName(defaultName(absolutePath), existing.map((entry) => entry.name)),
      path: absolutePath,
      addedAtMs: Date.now(),
    };
    this.writeConfig({ directories: [...existing, directory] });
    return { status: "added", directory };
  }

  remove(selector: string): WorkspaceDirectory | undefined {
    const trimmed = stripWrappingQuotes(selector.trim());
    if (!trimmed) return undefined;
    const current = this.list();
    const index = Number(trimmed);
    const target = Number.isInteger(index) && index >= 1
      ? current[index - 1]
      : current.find((entry) =>
          entry.name === normalizeName(trimmed) ||
          path.resolve(entry.path).toLowerCase() === path.resolve(expandHome(trimmed)).toLowerCase(),
        );
    if (!target) return undefined;
    this.writeConfig({ directories: current.filter((entry) => entry.path !== target.path) });
    return target;
  }

  clear(): number {
    const count = this.list().length;
    this.writeConfig({ directories: [] });
    return count;
  }

  configPath(): string {
    return path.join(this.projectPath, ".deepseekcode", "workspaces.json");
  }

  private readConfig(): WorkspaceConfig {
    const filePath = this.configPath();
    if (!fs.existsSync(filePath)) return { directories: [] };
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<WorkspaceConfig>;
      return {
        directories: Array.isArray(parsed.directories)
          ? parsed.directories.filter(isWorkspaceDirectory)
          : [],
      };
    } catch {
      return { directories: [] };
    }
  }

  private writeConfig(config: WorkspaceConfig): void {
    const filePath = this.configPath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  }
}

export function formatWorkspaceAddResult(result: WorkspaceAddResult): string {
  switch (result.status) {
    case "added":
      return `added working directory ${result.directory.name}: ${result.directory.path}`;
    case "empty":
      return "Usage: /add-dir <path> | list | remove <index|path> | clear";
    case "not_found":
      return `Path not found: ${result.path}`;
    case "not_directory":
      return `Not a directory: ${result.path}`;
    case "already_covered":
      return `Already covered: ${result.path}\nby: ${result.by}`;
    case "overlaps_existing":
      return `Refusing overlapping directory: ${result.path}\nexisting: ${result.existing}`;
  }
}

function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith(`~${path.sep}`) || value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function defaultName(value: string): string {
  const base = normalizeName(path.basename(path.resolve(value)));
  return base || "workspace";
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

function uniqueName(base: string, existing: string[]): string {
  const used = new Set(existing);
  if (!used.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

function isWorkspaceDirectory(value: unknown): value is WorkspaceDirectory {
  const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return (
    typeof candidate.name === "string" &&
    typeof candidate.path === "string" &&
    typeof candidate.addedAtMs === "number"
  );
}

function isInsideOrSame(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
