import type { Command } from "../types/command.js";
import { discoverPlugins } from "./registry.js";
import { loadPlugin } from "./loader.js";
import type { PluginCommandManifest, PluginManifest } from "./manifest.js";

export function discoverPluginCommands(projectPath: string, dataDir: string): Command[] {
  const commands: Command[] = [];
  for (const summary of discoverPlugins(projectPath, dataDir)) {
    if (!summary.enabled) continue;
    const plugin = loadPlugin(projectPath, dataDir, summary.name);
    if (!plugin?.manifest) continue;
    for (const command of plugin.manifest.commands) {
      commands.push(toSlashCommand(plugin.manifest, command));
    }
  }
  return commands.sort((a, b) => a.name.localeCompare(b.name));
}

function toSlashCommand(plugin: PluginManifest, command: PluginCommandManifest): Command {
  const name = `${plugin.name}:${command.name}`;
  return {
    name,
    aliases: command.aliases.map((alias) => `${plugin.name}:${alias}`),
    description: `[plugin ${plugin.name}] ${command.description}`,
    usage: command.usage,
    execute(args) {
      const template = command.response ?? command.prompt;
      if (!template) {
        return {
          message: `Plugin command ${name} has no response or prompt configured.`,
        };
      }
      const rendered = renderTemplate(template, {
        args,
        plugin: plugin.name,
        command: command.name,
      });
      return {
        message: command.prompt && !command.response
          ? [`Plugin prompt ${name}`, rendered].join("\n")
          : rendered,
      };
    },
  };
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(args|plugin|command)\}/g, (_, key: string) => values[key] ?? "");
}
