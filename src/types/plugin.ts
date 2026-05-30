export interface PluginManifestSummary {
  name: string;
  version?: string;
  commands?: string[];
  enabled?: boolean;
}

export function pluginDisplayName(plugin: PluginManifestSummary): string {
  return plugin.version ? `${plugin.name}@${plugin.version}` : plugin.name;
}
