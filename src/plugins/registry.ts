import fs from "node:fs";
import path from "node:path";

export interface PluginSummary {
  name: string;
  path: string;
  scope: "project" | "user" | "cache";
  enabled: boolean;
}

export function discoverPlugins(projectPath: string, dataDir: string): PluginSummary[] {
  const userHome = process.env.USERPROFILE ?? process.env.HOME ?? "";
  const roots: Array<{ scope: PluginSummary["scope"]; dir: string }> = [
    { scope: "project", dir: path.join(projectPath, ".deepseekcode", "plugins") },
    { scope: "user", dir: userHome ? path.join(userHome, ".deepseekcode", "plugins") : "" },
    { scope: "cache", dir: path.join(dataDir, "cache", "plugins") },
  ];
  const plugins: PluginSummary[] = [];
  for (const root of roots) {
    if (!root.dir || !fs.existsSync(root.dir)) continue;
    for (const entry of fs.readdirSync(root.dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pluginDir = path.join(root.dir, entry.name);
      plugins.push({
        name: entry.name,
        path: pluginDir,
        scope: root.scope,
        enabled: !fs.existsSync(path.join(pluginDir, ".disabled")),
      });
    }
  }
  return plugins.sort((a, b) => `${a.scope}:${a.name}`.localeCompare(`${b.scope}:${b.name}`));
}
