import fs from "node:fs";
import path from "node:path";
import { discoverPlugins, type PluginSummary } from "./registry.js";
import { parsePluginManifest, type PluginManifest } from "./manifest.js";

export interface LoadedPlugin extends PluginSummary {
  manifest?: PluginManifest;
  manifestError?: string;
}

export function loadPlugin(projectPath: string, dataDir: string, name: string): LoadedPlugin | null {
  const plugin = discoverPlugins(projectPath, dataDir).find((candidate) => candidate.name === name);
  if (!plugin) return null;
  const manifestPath = path.join(plugin.path, ".codex-plugin", "plugin.json");
  const manifest = readManifest(manifestPath);
  return {
    ...plugin,
    ...manifest,
  };
}

function readManifest(manifestPath: string): Pick<LoadedPlugin, "manifest" | "manifestError"> {
  if (!fs.existsSync(manifestPath)) return {};
  try {
    return {
      manifest: parsePluginManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8"))),
    };
  } catch (error) {
    return {
      manifestError: error instanceof Error ? error.message : String(error),
    };
  }
}
