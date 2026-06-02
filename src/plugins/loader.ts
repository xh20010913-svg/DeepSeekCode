import fs from "node:fs";
import path from "node:path";
import { discoverPlugins, type PluginSummary } from "./registry.js";
import { parsePluginManifestJson, type PluginManifest } from "./manifest.js";

export interface LoadedPlugin extends PluginSummary {
  manifest?: PluginManifest;
  manifestError?: string;
}

export function loadPlugin(projectPath: string, dataDir: string, name: string): LoadedPlugin | null {
  const plugin = discoverPlugins(projectPath, dataDir).find((candidate) => candidate.name === name);
  if (!plugin) return null;
  const manifestPath = pluginManifestPath(plugin.path);
  const manifest = readManifest(manifestPath);
  return {
    ...plugin,
    ...manifest,
  };
}

export function pluginManifestPath(pluginPath: string): string {
  const codexPath = path.join(pluginPath, ".codex-plugin", "plugin.json");
  if (fs.existsSync(codexPath)) return codexPath;
  return path.join(pluginPath, ".claude-plugin", "plugin.json");
}

function readManifest(manifestPath: string): Pick<LoadedPlugin, "manifest" | "manifestError"> {
  if (!fs.existsSync(manifestPath)) return {};
  try {
    return {
      manifest: parsePluginManifestJson(fs.readFileSync(manifestPath, "utf8")),
    };
  } catch (error) {
    return {
      manifestError: error instanceof Error ? error.message : String(error),
    };
  }
}
