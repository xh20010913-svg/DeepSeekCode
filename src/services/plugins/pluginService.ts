import fs from "node:fs";
import path from "node:path";
import { discoverPlugins, type PluginSummary } from "../../plugins/registry.js";
import { loadPlugin, pluginManifestPath, type LoadedPlugin } from "../../plugins/loader.js";
import {
  normalizePluginName,
  parsePluginManifestJson,
  renderPluginManifest,
  validatePluginManifest,
  type PluginValidationResult,
} from "../../plugins/manifest.js";
import { resolveInstallSource } from "../install/installSource.js";

export interface PluginSourceMetadata {
  kind: "path" | "git";
  sourcePath: string;
  sourceUrl?: string;
  ref?: string;
  subpath?: string;
  installedAtMs: number;
  updatedAtMs?: number;
}

export interface PluginSearchResult {
  name: string;
  scope: PluginSummary["scope"];
  enabled: boolean;
  path: string;
  description: string;
  commands: string[];
  source?: PluginSourceMetadata;
}

export class PluginService {
  constructor(
    private readonly projectPath: string,
    private readonly dataDir: string,
  ) {}

  list(): PluginSummary[] {
    return discoverPlugins(this.projectPath, this.dataDir);
  }

  load(name: string): LoadedPlugin | null {
    return loadPlugin(this.projectPath, this.dataDir, name);
  }

  createProjectPlugin(input: {
    name: string;
    description: string;
    commandName?: string;
    response?: string;
    prompt?: string;
    overwrite?: boolean;
  }): LoadedPlugin {
    const name = normalizePluginName(input.name);
    if (!name) throw new Error("plugin name is empty");
    const description = input.description.trim();
    if (!description) throw new Error("plugin description is empty");
    const pluginDir = path.join(this.projectPath, ".deepseekcode", "plugins", name);
    const manifestDir = path.join(pluginDir, ".codex-plugin");
    const manifestPath = path.join(manifestDir, "plugin.json");
    if (fs.existsSync(manifestPath) && !input.overwrite) {
      throw new Error(`plugin already exists: ${name}`);
    }
    fs.mkdirSync(manifestDir, { recursive: true });
    fs.writeFileSync(manifestPath, renderPluginManifest({
      name,
      description,
      commandName: input.commandName,
      response: input.response,
      prompt: input.prompt,
    }), "utf8");
    const plugin = this.load(name);
    if (!plugin) throw new Error(`failed to load created plugin: ${name}`);
    return plugin;
  }

  installFromPath(input: { sourcePath: string; name?: string; overwrite?: boolean }): LoadedPlugin {
    const resolvedSource = resolveInstallSource({
      sourcePath: input.sourcePath,
      projectPath: this.projectPath,
      dataDir: this.dataDir,
      cacheNamespace: "plugins",
    });
    const sourcePath = resolvedSource.path;
    const sourceManifestPath = pluginManifestPath(sourcePath);
    if (!fs.existsSync(sourceManifestPath)) {
      throw new Error(`plugin manifest not found: ${path.join(sourcePath, ".codex-plugin", "plugin.json")} or ${path.join(sourcePath, ".claude-plugin", "plugin.json")}`);
    }
    const rawManifest = parsePluginManifestJson(fs.readFileSync(sourceManifestPath, "utf8"));
    const name = normalizePluginName(input.name ?? rawManifest.name);
    if (!name) throw new Error("plugin name is empty");
    const pluginRoot = path.join(this.projectPath, ".deepseekcode", "plugins");
    const targetPath = path.join(pluginRoot, name);
    const targetRelative = path.relative(pluginRoot, targetPath);
    if (targetRelative.startsWith("..") || path.isAbsolute(targetRelative)) {
      throw new Error(`plugin target escapes project plugin root: ${targetPath}`);
    }
    if (fs.existsSync(targetPath)) {
      if (!input.overwrite) throw new Error(`plugin already exists: ${name}`);
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
    fs.mkdirSync(pluginRoot, { recursive: true });
    fs.cpSync(sourcePath, targetPath, {
      recursive: true,
      filter: (source) => shouldCopyPluginPath(source),
    });
    const manifestPath = pluginManifestPath(targetPath);
    const manifest = parsePluginManifestJson(fs.readFileSync(manifestPath, "utf8")) as unknown as Record<string, unknown>;
    if (manifest.name !== name) {
      manifest.name = name;
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    }
    writeSourceMetadata(targetPath, {
      ...resolvedSource.metadata,
      installedAtMs: Date.now(),
    });
    const plugin = this.load(name);
    if (!plugin) throw new Error(`failed to load installed plugin: ${name}`);
    return plugin;
  }

  search(query: string): PluginSearchResult[] {
    const needle = query.trim().toLowerCase();
    return this.list()
      .map((summary) => this.toSearchResult(summary))
      .filter((result) => {
        if (!needle) return true;
        return [
          result.name,
          result.description,
          result.commands.join(" "),
          result.scope,
        ].join(" ").toLowerCase().includes(needle);
      });
  }

  source(name: string): PluginSourceMetadata | undefined {
    const plugin = this.requirePlugin(name);
    return readSourceMetadata(plugin.path);
  }

  update(name: string): LoadedPlugin {
    const plugin = this.requirePlugin(name);
    const source = readSourceMetadata(plugin.path);
    if (!source) throw new Error(`plugin has no tracked source: ${name}`);
    const resolvedSource = resolveInstallSource({
      sourcePath: source.sourcePath,
      projectPath: this.projectPath,
      dataDir: this.dataDir,
      cacheNamespace: "plugins",
    });
    if (!fs.existsSync(pluginManifestPath(resolvedSource.path))) {
      throw new Error(`plugin source is missing: ${source.sourcePath}`);
    }
    const updated = this.installFromPath({
      sourcePath: source.sourcePath,
      name: plugin.name,
      overwrite: true,
    });
    writeSourceMetadata(updated.path, {
      ...source,
      updatedAtMs: Date.now(),
    });
    return updated;
  }

  uninstall(name: string): string {
    const plugin = this.requirePlugin(name);
    const pluginRoot = path.join(this.projectPath, ".deepseekcode", "plugins");
    const relative = path.relative(pluginRoot, plugin.path);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`refusing to uninstall non-project plugin: ${plugin.name}`);
    }
    fs.rmSync(plugin.path, { recursive: true, force: true });
    return plugin.path;
  }

  enable(name: string): LoadedPlugin {
    const plugin = this.requirePlugin(name);
    const disabledPath = path.join(plugin.path, ".disabled");
    if (fs.existsSync(disabledPath)) fs.rmSync(disabledPath, { force: true });
    return this.requirePlugin(name);
  }

  disable(name: string): LoadedPlugin {
    const plugin = this.requirePlugin(name);
    fs.writeFileSync(path.join(plugin.path, ".disabled"), "disabled\n", "utf8");
    return this.requirePlugin(name);
  }

  validate(name?: string): PluginValidationResult[] {
    const plugins = name
      ? this.list().filter((candidate) => candidate.name === name)
      : this.list();
    if (name && plugins.length === 0) {
      return [{
        name,
        path: "",
        ok: false,
        errors: [`plugin not found: ${name}`],
        warnings: [],
      }];
    }
    return plugins.map((plugin) => {
      const manifestPath = pluginManifestPath(plugin.path);
      return validatePluginManifest(
        plugin.name,
        plugin.path,
        fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, "utf8") : null,
      );
    });
  }

  private requirePlugin(name: string): LoadedPlugin {
    const plugin = this.load(name);
    if (!plugin) throw new Error(`Plugin not found: ${name}`);
    return plugin;
  }

  private toSearchResult(summary: PluginSummary): PluginSearchResult {
    const loaded = this.load(summary.name);
    return {
      name: summary.name,
      scope: summary.scope,
      enabled: summary.enabled,
      path: summary.path,
      description: loaded?.manifest?.description ?? "",
      commands: loaded?.manifest?.commands.map((command) => command.name) ?? [],
      source: readSourceMetadata(summary.path),
    };
  }
}

function shouldCopyPluginPath(sourcePath: string): boolean {
  const parts = sourcePath.split(/[\\/]/);
  return !parts.some((part) => part === ".git" || part === "node_modules" || part === ".DS_Store" || part === ".env");
}

function sourceMetadataPath(pluginPath: string): string {
  return path.join(pluginPath, ".deepseekcode-source.json");
}

function writeSourceMetadata(pluginPath: string, metadata: PluginSourceMetadata): void {
  fs.writeFileSync(sourceMetadataPath(pluginPath), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

function readSourceMetadata(pluginPath: string): PluginSourceMetadata | undefined {
  const metadataPath = sourceMetadataPath(pluginPath);
  if (!fs.existsSync(metadataPath)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as PluginSourceMetadata;
    if (!["path", "git"].includes(parsed.kind) || typeof parsed.sourcePath !== "string") return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}
