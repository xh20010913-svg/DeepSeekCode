import React from "react";
import type { Command } from "../../types/command.js";
import { McpService } from "../../services/mcp/mcpService.js";
import {
  McpPanel,
  mcpHealthPanelModel,
  mcpServersPanelModel,
  mcpSessionsPanelModel,
  mcpToolsPanelModel,
  mcpValidationPanelModel,
} from "../../components/McpPanel.js";

export const mcpCommand: Command = {
  name: "mcp",
  description: "Manage local DeepSeekCode MCP server configuration.",
  usage: "[list|add-stdio <name> <command...>|add-http <name> <url>|health [name]|connect <name>|sessions|close [name|all]|enable <name>|disable <name>|remove <name>|validate [name]|show <name>|tools <name>|call <name> <tool> [json]]",
  async execute(args, context) {
    const trimmed = args.trim();
    const service = new McpService(context.config.projectPath);
    if (!trimmed || trimmed === "list") {
      const servers = service.list();
      if (servers.length === 0) {
        return {
          message: "No MCP servers configured.",
          display: React.createElement(McpPanel, { model: mcpServersPanelModel(servers) }),
        };
      }
      return {
        message: servers.map((server) =>
          `${server.enabled ? "enabled" : "disabled"} ${server.name} ${server.type} ${server.command ?? server.url ?? ""}`.trim(),
        ).join("\n"),
        display: React.createElement(McpPanel, { model: mcpServersPanelModel(servers) }),
      };
    }
    if (trimmed.startsWith("add-stdio ")) {
      const [name, ...commandParts] = parseArgs(trimmed.slice("add-stdio ".length));
      if (!name || commandParts.length === 0) return { message: "Usage: /mcp add-stdio <name> <command...>" };
      try {
        const server = service.addStdio({ name, command: commandParts.join(" ") });
        return { message: `added MCP stdio server ${server.name}` };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("add-http ")) {
      const [name, url] = parseArgs(trimmed.slice("add-http ".length));
      if (!name || !url) return { message: "Usage: /mcp add-http <name> <url>" };
      try {
        const server = service.addHttp({ name, url });
        return { message: `added MCP http server ${server.name}` };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("enable ") || trimmed.startsWith("disable ")) {
      const [verb, name] = trimmed.split(/\s+/);
      if (!name) return { message: `Usage: /mcp ${verb} <name>` };
      const server = service.setEnabled(name, verb === "enable");
      return { message: server ? `MCP server ${server.name} ${server.enabled ? "enabled" : "disabled"}` : `MCP server not found: ${name}` };
    }
    if (trimmed.startsWith("remove ")) {
      const name = trimmed.slice("remove ".length).trim();
      return { message: service.remove(name) ? `removed MCP server ${name}` : `MCP server not found: ${name}` };
    }
    if (trimmed === "validate" || trimmed.startsWith("validate ")) {
      const name = trimmed.startsWith("validate ") ? trimmed.slice("validate ".length).trim() : undefined;
      const results = service.validate(name);
      if (results.length === 0) {
        return {
          message: "No MCP servers to validate.",
          display: React.createElement(McpPanel, { model: mcpValidationPanelModel(results) }),
        };
      }
      return {
        message: results.map((result) => [
          `${result.ok ? "ok" : "failed"} ${result.name}`,
          ...result.errors.map((error) => `  error: ${error}`),
          ...result.warnings.map((warning) => `  warning: ${warning}`),
        ].join("\n")).join("\n"),
        display: React.createElement(McpPanel, { model: mcpValidationPanelModel(results) }),
      };
    }
    if (trimmed.startsWith("show ")) {
      const name = trimmed.slice("show ".length).trim();
      const server = service.list().find((candidate) => candidate.name === name);
      return { message: server ? JSON.stringify(server, null, 2) : `MCP server not found: ${name}` };
    }
    if (trimmed === "health" || trimmed.startsWith("health ")) {
      const name = trimmed.startsWith("health ") ? trimmed.slice("health ".length).trim() : undefined;
      try {
        const results = await service.health(name, {
          allowShell: context.permissions.allowShell,
          attempts: 2,
          backoffMs: 100,
        });
        if (results.length === 0) {
          return {
            message: "No MCP servers configured.",
            display: React.createElement(McpPanel, { model: mcpHealthPanelModel(results) }),
          };
        }
        return {
          message: results.map((result) => [
            `${result.status} ${result.name} ${result.type} enabled=${result.enabled} attempts=${result.attempts} latencyMs=${result.latencyMs} tools=${result.toolCount}`,
            result.error ? `  error: ${result.error}` : "",
            result.stderr?.trim() ? `  stderr: ${result.stderr.trim()}` : "",
          ].filter(Boolean).join("\n")).join("\n"),
          display: React.createElement(McpPanel, { model: mcpHealthPanelModel(results) }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("connect ")) {
      const name = trimmed.slice("connect ".length).trim();
      if (!name) return { message: "Usage: /mcp connect <name>" };
      try {
        const probe = await service.connect(name, { allowShell: context.permissions.allowShell });
        return { message: `connected MCP server ${name} tools=${probe.tools.length}` };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed === "sessions") {
      const sessions = service.sessions();
      if (sessions.length === 0) {
        return {
          message: "No MCP sessions connected.",
          display: React.createElement(McpPanel, { model: mcpSessionsPanelModel(sessions) }),
        };
      }
      return {
        message: sessions.map((session) =>
          `${session.name} ${session.type} tools=${session.toolCount} lastUsed=${new Date(session.lastUsedAtMs).toISOString()}`,
        ).join("\n"),
        display: React.createElement(McpPanel, { model: mcpSessionsPanelModel(sessions) }),
      };
    }
    if (trimmed === "close" || trimmed.startsWith("close ")) {
      const name = trimmed.startsWith("close ") ? trimmed.slice("close ".length).trim() : "all";
      const count = service.closeSession(!name || name === "all" ? undefined : name);
      return { message: `closed ${count} MCP session${count === 1 ? "" : "s"}` };
    }
    if (trimmed.startsWith("tools ")) {
      const name = trimmed.slice("tools ".length).trim();
      if (!name) return { message: "Usage: /mcp tools <name>" };
      try {
        const probe = await service.probe(name, { allowShell: context.permissions.allowShell });
        return {
          message: [
            `MCP server ${name} tools=${probe.tools.length}`,
            ...probe.tools.map((tool) => formatTool(tool)),
            probe.stderr.trim() ? `stderr:\n${probe.stderr.trim()}` : "",
          ].filter(Boolean).join("\n"),
          display: React.createElement(McpPanel, {
            model: mcpToolsPanelModel(name, probe.tools, probe.stderr),
          }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("call ")) {
      const [name, toolName, ...jsonParts] = parseArgs(trimmed.slice("call ".length));
      if (!name || !toolName) return { message: "Usage: /mcp call <name> <tool> [json]" };
      try {
        const result = await service.callTool(
          name,
          toolName,
          parseJsonObject(jsonParts.join(" ")),
          { allowShell: context.permissions.allowShell },
        );
        return {
          message: [
            `MCP call ${name}/${toolName}`,
            JSON.stringify(result.result, null, 2),
            result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : "",
          ].filter(Boolean).join("\n"),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    return { message: "Usage: /mcp [list|add-stdio <name> <command...>|add-http <name> <url>|health [name]|connect <name>|sessions|close [name|all]|enable <name>|disable <name>|remove <name>|validate [name]|show <name>|tools <name>|call <name> <tool> [json]]" };
  },
};

function parseArgs(args: string): string[] {
  return [...args.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? "",
  );
}

function parseJsonObject(value: string): Record<string, unknown> {
  if (!value.trim()) return {};
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("MCP call arguments must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function formatTool(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const name = String(record.name ?? "(unnamed)");
    const description = typeof record.description === "string" ? ` - ${record.description}` : "";
    return `- ${name}${description}`;
  }
  return `- ${JSON.stringify(value)}`;
}
