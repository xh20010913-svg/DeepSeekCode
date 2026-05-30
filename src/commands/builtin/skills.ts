import React from "react";
import type { Command } from "../../types/command.js";
import { SkillService } from "../../services/skills/skillService.js";
import { runSkillTask } from "../../services/skills/skillRunner.js";
import {
  SkillPanel,
  skillDetailPanelModel,
  skillListPanelModel,
  skillSearchPanelModel,
  skillValidationPanelModel,
} from "../../components/SkillPanel.js";

export const skillsCommand: Command = {
  name: "skills",
  description: "List, search, show, create, install, update, uninstall, validate, and run DeepSeekCode skills.",
  usage: "[search [query]|show <name>|source <name>|create <name> <description>|install <path> [name]|update <name>|uninstall <name>|run <name> <task>|validate [name]|path [name]]",
  async execute(args, context) {
    const trimmed = args.trim();
    const service = new SkillService(context.config.projectPath, context.config.dataDir);
    if (trimmed === "search" || trimmed.startsWith("search ")) {
      const query = trimmed.startsWith("search ") ? trimmed.slice("search ".length).trim() : "";
      const results = service.search(query);
      if (results.length === 0) {
        return {
          message: "No skills matched.",
          display: React.createElement(SkillPanel, { model: skillSearchPanelModel(results, query) }),
        };
      }
      return {
        message: results.map((skill) => {
          const source = skill.source ? ` source=${skill.source.kind}:${skill.source.sourcePath}` : "";
          const flags = skill.disableModelInvocation ? " disable-model-invocation" : "";
          return `${skill.scope}/${skill.name} - ${skill.description}${flags}${source}`.trim();
        }).join("\n"),
        display: React.createElement(SkillPanel, { model: skillSearchPanelModel(results, query) }),
      };
    }
    if (trimmed.startsWith("create ")) {
      const [name, ...descriptionParts] = parseArgs(trimmed.slice("create ".length));
      if (!name || descriptionParts.length === 0) return { message: "Usage: /skills create <name> <description>" };
      try {
        const skill = service.createProjectSkill({
          name,
          description: descriptionParts.join(" "),
        });
        return {
          message: `created skill ${skill.scope}/${skill.name}: ${skill.path}`,
          display: React.createElement(SkillPanel, { model: skillDetailPanelModel(skill) }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("install ")) {
      const [sourcePath, name] = parseArgs(trimmed.slice("install ".length));
      if (!sourcePath) return { message: "Usage: /skills install <path> [name]" };
      try {
        const skill = service.installFromPath({ sourcePath, name });
        return {
          message: `installed skill ${skill.scope}/${skill.name}: ${skill.path}`,
          display: React.createElement(SkillPanel, { model: skillDetailPanelModel(skill) }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("update ")) {
      const name = trimmed.slice("update ".length).trim();
      if (!name) return { message: "Usage: /skills update <name>" };
      try {
        const skill = service.update(name);
        return {
          message: `updated skill ${skill.scope}/${skill.name}: ${skill.path}`,
          display: React.createElement(SkillPanel, { model: skillDetailPanelModel(skill) }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("uninstall ")) {
      const name = trimmed.slice("uninstall ".length).trim();
      if (!name) return { message: "Usage: /skills uninstall <name>" };
      try {
        const removedPath = service.uninstall(name);
        return { message: `uninstalled skill ${name}: ${removedPath}` };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("source ")) {
      const name = trimmed.slice("source ".length).trim();
      if (!name) return { message: "Usage: /skills source <name>" };
      try {
        const source = service.source(name);
        return { message: source ? JSON.stringify(source, null, 2) : `No tracked source for skill ${name}` };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("run ")) {
      const [name, ...taskParts] = parseArgs(trimmed.slice("run ".length));
      if (!name || taskParts.length === 0) return { message: "Usage: /skills run <name> <task>" };
      if (!context.provider) {
        return { message: "Provider missing; configure DEEPSEEK_API_KEY before running skills." };
      }
      try {
        const result = await runSkillTask({
          name,
          task: taskParts.join(" "),
          config: context.config,
          provider: context.provider,
          permissions: context.permissions,
        });
        return {
          message: [
            `skill ${result.skill.scope}/${result.skill.name} completed: ${result.execution.status}`,
            result.execution.final_message || "(no final message)",
            `turns=${result.turns.length}`,
            `actions=${result.envelope.actions.length}`,
            ...result.execution.results.map((item) => `- ${item.action_type}: ${item.status}${item.message ? ` ${item.message}` : ""}`),
          ].join("\n"),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed === "validate" || trimmed.startsWith("validate ")) {
      const name = trimmed.startsWith("validate ") ? trimmed.slice("validate ".length).trim() : undefined;
      const results = service.validate(name);
      if (results.length === 0) {
        return {
          message: "No skills to validate.",
          display: React.createElement(SkillPanel, { model: skillValidationPanelModel(results) }),
        };
      }
      return {
        message: results.map((result) => [
          `${result.ok ? "ok" : "failed"} ${result.name} ${result.path}`,
          ...result.errors.map((error) => `  error: ${error}`),
          ...result.warnings.map((warning) => `  warning: ${warning}`),
        ].join("\n")).join("\n"),
        display: React.createElement(SkillPanel, { model: skillValidationPanelModel(results) }),
      };
    }
    if (trimmed === "path" || trimmed.startsWith("path ")) {
      const name = trimmed.startsWith("path ") ? trimmed.slice("path ".length).trim() : "";
      if (!name) return { message: `${context.config.projectPath}\\.deepseekcode\\skills` };
      const skill = service.load(name);
      return { message: skill ? skill.path : `Skill not found: ${name}` };
    }
    if (trimmed.startsWith("show ")) {
      const name = trimmed.slice("show ".length).trim();
      const skill = service.load(name);
      if (!skill) return { message: `Skill not found: ${name}` };
      return {
        message: [
          `${skill.scope}/${skill.name}`,
          skill.path,
          skill.frontmatter.description ? `description: ${skill.frontmatter.description}` : "",
          skill.frontmatter.disableModelInvocation ? "disable-model-invocation: true" : "",
          "",
          skill.prompt.slice(0, 4000) || "(empty SKILL.md)",
        ].filter((line) => line !== "").join("\n"),
        display: React.createElement(SkillPanel, { model: skillDetailPanelModel(skill) }),
      };
    }
    const skills = service.list();
    if (skills.length === 0) {
      return {
        message: "No skill directories discovered.",
        display: React.createElement(SkillPanel, { model: skillListPanelModel(skills) }),
      };
    }
    return {
      message: skills.map((skill) => `${skill.scope}/${skill.name} - ${skill.description || skill.path}`).join("\n"),
      display: React.createElement(SkillPanel, { model: skillListPanelModel(skills) }),
    };
  },
};

function parseArgs(args: string): string[] {
  return [...args.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? "",
  );
}
