import fs from "node:fs";
import path from "node:path";
import { loadPlugin, type LoadedPlugin } from "./loader.js";
import { discoverPlugins } from "./registry.js";

export interface PluginExtensionDir {
  plugin: LoadedPlugin;
  path: string;
}

export function enabledPluginManifests(projectPath: string, dataDir: string): LoadedPlugin[] {
  return discoverPlugins(projectPath, dataDir)
    .filter((plugin) => plugin.enabled)
    .map((plugin) => loadPlugin(projectPath, dataDir, plugin.name))
    .filter((plugin): plugin is LoadedPlugin => Boolean(plugin?.manifest));
}

export function pluginExtensionDirs(
  projectPath: string,
  dataDir: string,
  kind: "agents" | "output_styles",
): PluginExtensionDir[] {
  const dirs: PluginExtensionDir[] = [];
  for (const plugin of enabledPluginManifests(projectPath, dataDir)) {
    const entries = plugin.manifest?.[kind] ?? [];
    for (const entry of entries) {
      const resolved = resolvePluginPath(plugin.path, entry);
      if (!resolved || !fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) continue;
      dirs.push({ plugin, path: resolved });
    }
  }
  return dirs;
}

function resolvePluginPath(pluginRoot: string, relativePath: string): string | null {
  const root = path.resolve(pluginRoot);
  const resolved = path.resolve(root, relativePath);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}
