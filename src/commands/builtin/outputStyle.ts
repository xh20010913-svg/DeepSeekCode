import React from "react";
import type { Command } from "../../types/command.js";
import { OutputStyleService } from "../../services/outputStyles/outputStyleService.js";
import {
  OutputStylePanel,
  outputStyleDetailPanelModel,
  outputStyleListPanelModel,
  outputStyleValidationPanelModel,
} from "../../components/OutputStylePanel.js";

export const outputStyleCommand: Command = {
  name: "output-style",
  aliases: ["outputStyle"],
  description: "List, show, set, create, and validate DeepSeekCode output styles.",
  usage: "[list|show <name>|set <name>|create <name> <description>|validate [name]]",
  execute(args, context) {
    const trimmed = args.trim();
    const service = new OutputStyleService(context.config.projectPath, context.config.dataDir);
    if (!trimmed || trimmed === "list") {
      const current = service.current().name;
      const styles = service.list();
      return {
        message: styles.map((style) =>
          `${style.name === current ? "*" : " "} ${style.scope}/${style.name} - ${style.description}`,
        ).join("\n"),
        display: React.createElement(OutputStylePanel, {
          model: outputStyleListPanelModel(styles, current),
        }),
      };
    }
    if (trimmed.startsWith("show ")) {
      const name = trimmed.slice("show ".length).trim();
      const style = service.load(name);
      if (!style) return { message: `Output style not found: ${name}` };
      return {
        message: [
          `${style.scope}/${style.name}`,
          style.path ?? "(builtin)",
          `description: ${style.description}`,
          "",
          style.prompt,
        ].join("\n"),
        display: React.createElement(OutputStylePanel, {
          model: outputStyleDetailPanelModel(style, service.current().name),
        }),
      };
    }
    if (trimmed.startsWith("set ")) {
      const name = trimmed.slice("set ".length).trim();
      try {
        const style = service.setCurrent(name);
        return {
          message: `output style: ${style.name}`,
          display: React.createElement(OutputStylePanel, {
            model: outputStyleDetailPanelModel(style, style.name),
          }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("create ")) {
      const [name, ...descriptionParts] = parseArgs(trimmed.slice("create ".length));
      if (!name || descriptionParts.length === 0) return { message: "Usage: /output-style create <name> <description>" };
      try {
        const style = service.createProjectStyle({
          name,
          description: descriptionParts.join(" "),
        });
        return {
          message: `created output style ${style.scope}/${style.name}: ${style.path}`,
          display: React.createElement(OutputStylePanel, {
            model: outputStyleDetailPanelModel(style, service.current().name),
          }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed === "validate" || trimmed.startsWith("validate ")) {
      const name = trimmed.startsWith("validate ") ? trimmed.slice("validate ".length).trim() : undefined;
      const results = service.validate(name);
      return {
        message: results.map((result) => [
          `${result.ok ? "ok" : "failed"} ${result.name} ${result.path}`,
          ...result.errors.map((error) => `  error: ${error}`),
          ...result.warnings.map((warning) => `  warning: ${warning}`),
        ].join("\n")).join("\n"),
        display: React.createElement(OutputStylePanel, {
          model: outputStyleValidationPanelModel(results),
        }),
      };
    }
    return { message: "Usage: /output-style [list|show <name>|set <name>|create <name> <description>|validate [name]]" };
  },
};

function parseArgs(args: string): string[] {
  return [...args.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? "",
  );
}
