import React from "react";
import type { Command } from "../../types/command.js";
import { PluginService } from "../../services/plugins/pluginService.js";
import {
  PluginPanel,
  pluginDetailPanelModel,
  pluginListPanelModel,
  pluginSearchPanelModel,
  pluginValidationPanelModel,
} from "../../components/PluginPanel.js";

export const pluginsCommand: Command = {
  name: "plugins",
  aliases: ["plugin"],
  description: "List, search, show, create, install, update, validate, enable, disable, and uninstall DeepSeekCode plugins.",
  usage: "[search [query]|show <name>|source <name>|create <name> <description>|install <path-or-git-url> [name]|update <name>|uninstall <name>|validate [name]|path [name]|enable <name>|disable <name>]",
  execute(args, context) {
    const trimmed = args.trim();
    const service = new PluginService(context.config.projectPath, context.config.dataDir);
    if (trimmed === "search" || trimmed.startsWith("search ")) {
      const query = trimmed.startsWith("search ") ? trimmed.slice("search ".length).trim() : "";
      const results = service.search(query);
      if (results.length === 0) {
        return {
          message: "No plugins matched.",
          display: React.createElement(PluginPanel, { model: pluginSearchPanelModel(results, query) }),
        };
      }
      return {
        message: results.map((plugin) => {
          const commands = plugin.commands.length ? ` commands=${plugin.commands.map((command) => `/${plugin.name}:${command}`).join(",")}` : "";
          const source = plugin.source ? ` source=${plugin.source.kind}:${plugin.source.sourcePath}` : "";
          return `${plugin.scope}/${plugin.name} ${plugin.enabled ? "enabled" : "disabled"} ${plugin.description}${commands}${source}`.trim();
        }).join("\n"),
        display: React.createElement(PluginPanel, { model: pluginSearchPanelModel(results, query) }),
      };
    }
    if (trimmed.startsWith("create ")) {
      const [name, ...descriptionParts] = parseArgs(trimmed.slice("create ".length));
      if (!name || descriptionParts.length === 0) return { message: "Usage: /plugins create <name> <description>" };
      try {
        const plugin = service.createProjectPlugin({
          name,
          description: descriptionParts.join(" "),
        });
        return {
          message: `created plugin ${plugin.scope}/${plugin.name}: ${plugin.path}`,
          display: React.createElement(PluginPanel, { model: pluginDetailPanelModel(plugin) }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("install ")) {
      const [sourcePath, name] = parseArgs(trimmed.slice("install ".length));
      if (!sourcePath) return { message: "Usage: /plugins install <path-or-git-url> [name]" };
      try {
        const plugin = service.installFromPath({ sourcePath, name });
        return {
          message: `installed plugin ${plugin.scope}/${plugin.name}: ${plugin.path}`,
          display: React.createElement(PluginPanel, { model: pluginDetailPanelModel(plugin) }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("update ")) {
      const name = trimmed.slice("update ".length).trim();
      if (!name) return { message: "Usage: /plugins update <name>" };
      try {
        const plugin = service.update(name);
        return {
          message: `updated plugin ${plugin.scope}/${plugin.name}: ${plugin.path}`,
          display: React.createElement(PluginPanel, { model: pluginDetailPanelModel(plugin) }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("source ")) {
      const name = trimmed.slice("source ".length).trim();
      if (!name) return { message: "Usage: /plugins source <name>" };
      try {
        const source = service.source(name);
        return { message: source ? JSON.stringify(source, null, 2) : `No tracked source for plugin ${name}` };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("uninstall ")) {
      const name = trimmed.slice("uninstall ".length).trim();
      if (!name) return { message: "Usage: /plugins uninstall <name>" };
      try {
        const removedPath = service.uninstall(name);
        return { message: `uninstalled plugin ${name}: ${removedPath}` };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed === "validate" || trimmed.startsWith("validate ")) {
      const name = trimmed.startsWith("validate ") ? trimmed.slice("validate ".length).trim() : undefined;
      const results = service.validate(name);
      if (results.length === 0) {
        return {
          message: "No plugins to validate.",
          display: React.createElement(PluginPanel, { model: pluginValidationPanelModel(results) }),
        };
      }
      return {
        message: results.map((result) => [
          `${result.ok ? "ok" : "failed"} ${result.name} ${result.path}`,
          ...result.errors.map((error) => `  error: ${error}`),
          ...result.warnings.map((warning) => `  warning: ${warning}`),
        ].join("\n")).join("\n"),
        display: React.createElement(PluginPanel, { model: pluginValidationPanelModel(results) }),
      };
    }
    if (trimmed === "path" || trimmed.startsWith("path ")) {
      const name = trimmed.startsWith("path ") ? trimmed.slice("path ".length).trim() : "";
      if (!name) return { message: `${context.config.projectPath}\\.deepseekcode\\plugins` };
      const plugin = service.load(name);
      return { message: plugin ? plugin.path : `Plugin not found: ${name}` };
    }
    if (trimmed.startsWith("enable ") || trimmed.startsWith("disable ")) {
      const [verb, name] = trimmed.split(/\s+/);
      if (!name) return { message: `Usage: /plugins ${verb} <name>` };
      try {
        const plugin = verb === "enable" ? service.enable(name) : service.disable(name);
        return {
          message: `${plugin.scope}/${plugin.name} ${plugin.enabled ? "enabled" : "disabled"}`,
          display: React.createElement(PluginPanel, { model: pluginDetailPanelModel(plugin) }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("show ")) {
      const name = trimmed.slice("show ".length).trim();
      const plugin = service.load(name);
      if (!plugin) return { message: `Plugin not found: ${name}` };
      return {
        message: [
          `${plugin.scope}/${plugin.name} ${plugin.enabled ? "enabled" : "disabled"}`,
          plugin.path,
          plugin.manifestError ? `manifest error: ${plugin.manifestError}` : "",
          plugin.manifest?.commands.length
            ? `commands: ${plugin.manifest.commands.map((command) => `/${plugin.manifest?.name}:${command.name}`).join(", ")}`
            : "commands: none",
          "",
          JSON.stringify(plugin.manifest ?? {}, null, 2),
        ].filter(Boolean).join("\n"),
        display: React.createElement(PluginPanel, { model: pluginDetailPanelModel(plugin) }),
      };
    }
    const plugins = service.list();
    if (plugins.length === 0) {
      return {
        message: "No plugin directories discovered.",
        display: React.createElement(PluginPanel, { model: pluginListPanelModel(plugins) }),
      };
    }
    const loadedPlugins = plugins.map((plugin) => service.load(plugin.name) ?? plugin);
    return {
      message: plugins.map((plugin) => {
        const loaded = service.load(plugin.name);
        const commands = loaded?.manifest?.commands.length
          ? ` commands=${loaded.manifest.commands.map((command) => `/${loaded.manifest?.name}:${command.name}`).join(",")}`
          : "";
        const error = loaded?.manifestError ? " manifest=invalid" : "";
        return `${plugin.scope}/${plugin.name} ${plugin.enabled ? "enabled" : "disabled"}${commands}${error}`;
      }).join("\n"),
      display: React.createElement(PluginPanel, { model: pluginListPanelModel(loadedPlugins) }),
    };
  },
};

function parseArgs(args: string): string[] {
  return [...args.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? "",
  );
}
