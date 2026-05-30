import React from "react";
import type { Command } from "../../types/command.js";
import { HookService } from "../../services/hooks/hookService.js";
import { HOOK_EVENTS, isHookEvent } from "../../hooks/events.js";
import { HookPanel, hookListPanelModel, hookValidationPanelModel } from "../../components/HookPanel.js";

export const hooksCommand: Command = {
  name: "hooks",
  description: "List, add, remove, run, and validate local DeepSeekCode hooks.",
  usage: "[add <id> <event> <matcher|-> <command...>|remove <id>|run <event> [payload-json]|validate]",
  async execute(args, context) {
    const trimmed = args.trim();
    const service = new HookService(context.config.projectPath, context.config.dataDir);

    if (trimmed.startsWith("add ")) {
      const [id, event, matcher, ...commandParts] = parseArgs(trimmed.slice("add ".length));
      if (!id || !event || !matcher || commandParts.length === 0) {
        return { message: "Usage: /hooks add <id> <event> <matcher|-> <command...>" };
      }
      try {
        const hook = service.add({
          id,
          event,
          matcher: matcher === "-" ? undefined : matcher,
          command: commandParts.join(" "),
        });
        return { message: `added hook ${hook.id}: ${hook.event}${hook.matcher ? ` ${hook.matcher}` : ""}` };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }

    if (trimmed.startsWith("remove ")) {
      const id = trimmed.slice("remove ".length).trim();
      if (!id) return { message: "Usage: /hooks remove <id>" };
      return { message: service.remove(id) ? `removed hook ${id}` : `Hook not found: ${id}` };
    }

    if (trimmed === "validate") {
      const result = service.validate();
      return {
        message: [
          `${result.ok ? "ok" : "failed"} ${result.path}`,
          ...result.errors.map((error) => `  error: ${error}`),
          ...result.warnings.map((warning) => `  warning: ${warning}`),
        ].join("\n"),
        display: React.createElement(HookPanel, { model: hookValidationPanelModel(result) }),
      };
    }

    if (trimmed.startsWith("run ")) {
      const [event, ...payloadParts] = parseArgs(trimmed.slice("run ".length));
      if (!event || !isHookEvent(event)) {
        return { message: `Usage: /hooks run <event> [payload-json]\nEvents: ${HOOK_EVENTS.join(", ")}` };
      }
      const payload = parsePayload(payloadParts.join(" "));
      const results = await service.runEvent(event, payload, { allowShell: context.permissions.allowShell });
      return {
        message: results.length === 0
          ? `No hooks matched ${event}.`
          : results.map((result) => [
            `${result.status} ${result.id} exit=${result.exitCode ?? "-"}${result.timedOut ? " timed_out" : ""}`,
            result.message ? `  ${result.message}` : "",
            result.stdout.trim() ? `  stdout: ${result.stdout.trim()}` : "",
            result.stderr.trim() ? `  stderr: ${result.stderr.trim()}` : "",
          ].filter(Boolean).join("\n")).join("\n"),
      };
    }

    const hooks = service.list();
    if (hooks.length === 0) {
      return {
        message: `No hooks configured.\nEvents: ${HOOK_EVENTS.join(", ")}`,
        display: React.createElement(HookPanel, { model: hookListPanelModel(hooks) }),
      };
    }
    return {
      message: hooks.map((hook) => [
        `${hook.enabled ? "enabled" : "disabled"} ${hook.id} ${hook.event}${hook.matcher ? ` ${hook.matcher}` : ""}`,
        `  ${hook.command}`,
      ].join("\n")).join("\n"),
      display: React.createElement(HookPanel, { model: hookListPanelModel(hooks) }),
    };
  },
};

function parseArgs(args: string): string[] {
  return [...args.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? "",
  );
}

function parsePayload(value: string): Record<string, unknown> {
  if (!value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : { value: parsed };
  } catch {
    return { value };
  }
}
