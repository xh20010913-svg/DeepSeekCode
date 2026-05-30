import React from "react";
import type { Command } from "../../types/command.js";
import {
  pullRemoteTextFile,
  pushRemoteTextFile,
  readRemoteTextFile,
} from "../../services/remote/sshFileSync.js";
import { checkSshHealth } from "../../services/remote/sshHealth.js";
import { SshProfileService } from "../../services/remote/sshProfileService.js";
import { SshQueueWorker } from "../../services/remote/sshQueueWorker.js";
import { runSshCommand, summarizeSshCommand } from "../../services/remote/sshRemoteExecutor.js";
import { resolveRunId } from "../runSelection.js";
import {
  SshPanel,
  sshHealthPanelModel,
  sshHistoryPanelModel,
  sshOperationPanelModel,
  sshProfileDetailPanelModel,
  sshProfilesPanelModel,
  sshSessionsPanelModel,
  sshWorkerPanelModel,
} from "../../components/SshPanel.js";

export const sshCommand: Command = {
  name: "ssh",
  description: "Manage local SSH profiles, remote command runs, and planned remote sessions.",
  usage: "[add <name> <host> [user] [port] [remotePath]|list|show <name>|preview <name>|health <name>|run <name> <command...>|cat <name> <remote-path> [max-chars]|pull <name> <remote-path> <local-path> [--overwrite]|push <name> <local-path> <remote-path> [--overwrite]|worker <name> <run-id|attached> [max-tasks]|history [limit]|connect <name>|sessions [limit]|close <session-id>|remove <name>|path]",
  async execute(args, context) {
    const trimmed = args.trim();
    const service = new SshProfileService(context.config.projectPath);
    if (!trimmed || trimmed === "list") {
      const profiles = service.listProfiles();
      if (profiles.length === 0) {
        return {
          message: "No SSH profiles configured.",
          display: React.createElement(SshPanel, { model: sshProfilesPanelModel(profiles) }),
        };
      }
      return {
        message: profiles.map((profile) => [
          profile.name,
          profile.user ? `${profile.user}@${profile.host}` : profile.host,
          profile.port ? `port=${profile.port}` : "",
          profile.remotePath ? `remotePath=${profile.remotePath}` : "",
        ].filter(Boolean).join(" ")).join("\n"),
        display: React.createElement(SshPanel, { model: sshProfilesPanelModel(profiles) }),
      };
    }
    if (trimmed.startsWith("add ")) {
      const [name, host, user, portText, ...remotePathParts] = parseArgs(trimmed.slice("add ".length));
      if (!name || !host) return { message: "Usage: /ssh add <name> <host> [user] [port] [remotePath]" };
      const port = portText ? Number.parseInt(portText, 10) : undefined;
      if (portText && !Number.isInteger(port)) return { message: `Invalid SSH port: ${portText}` };
      try {
        const profile = service.addProfile({
          name,
          host,
          user,
          port,
          remotePath: remotePathParts.join(" ") || undefined,
        });
        const preview = service.preview(profile.name);
        return {
          message: `ssh profile ${profile.name} saved: ${preview}`,
          display: React.createElement(SshPanel, { model: sshProfileDetailPanelModel(profile, preview) }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("show ")) {
      const name = trimmed.slice("show ".length).trim();
      const profile = service.getProfile(name);
      return {
        message: profile ? JSON.stringify(profile, null, 2) : `SSH profile not found: ${name}`,
        display: profile ? React.createElement(SshPanel, { model: sshProfileDetailPanelModel(profile, service.preview(profile.name)) }) : undefined,
      };
    }
    if (trimmed.startsWith("preview ")) {
      const name = trimmed.slice("preview ".length).trim();
      try {
        const profile = service.getProfile(name);
        const preview = service.preview(name);
        return {
          message: preview,
          display: profile ? React.createElement(SshPanel, { model: sshProfileDetailPanelModel(profile, preview) }) : undefined,
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("connect ")) {
      const name = trimmed.slice("connect ".length).trim();
      try {
        const session = service.connect(name);
        return {
          message: `${session.id} ${session.status} ${session.target}`,
          display: React.createElement(SshPanel, { model: sshSessionsPanelModel([session]) }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("health ")) {
      const name = trimmed.slice("health ".length).trim();
      if (!name) return { message: "Usage: /ssh health <name>" };
      if (!context.permissions.allowShell) {
        return { message: "SSH health checks are disabled. Run /shell on or /permissions profile dev first." };
      }
      try {
        const profile = service.getProfile(name);
        if (!profile) return { message: `SSH profile not found: ${name}` };
        const session = service.connect(profile.name);
        const result = await checkSshHealth(profile, {
          allowShell: context.permissions.allowShell,
          timeoutMs: 10_000,
          maxOutputChars: 4_000,
        });
        service.recordCommand(profile.name, result.output);
        service.updateSessionStatus(session.id, result.status === "ok" ? "connected" : "failed");
        return {
          message: [
            `${result.status} ${profile.name} ${result.target}`,
            `session=${session.id}`,
            result.message,
          ].join("\n"),
          display: React.createElement(SshPanel, { model: sshHealthPanelModel(result, session.id) }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("run ")) {
      const [name, ...commandParts] = parseArgs(trimmed.slice("run ".length));
      if (!name || commandParts.length === 0) return { message: "Usage: /ssh run <name> <command...>" };
      if (!context.permissions.allowShell) {
        return { message: "SSH execution is disabled. Run /shell on or /permissions profile dev first." };
      }
      try {
        const profile = service.getProfile(name);
        if (!profile) return { message: `SSH profile not found: ${name}` };
        const output = await runSshCommand(profile, commandParts.join(" "), {
          allowShell: context.permissions.allowShell,
          timeoutMs: 30_000,
          maxOutputChars: 8_000,
        });
        const record = service.recordCommand(profile.name, output);
        return {
          message: [`${record.id} ${profile.name}`, summarizeSshCommand(output)].join("\n"),
          display: React.createElement(SshPanel, { model: sshHistoryPanelModel([record]) }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("cat ")) {
      const [name, remotePath, maxCharsText] = parseArgs(trimmed.slice("cat ".length));
      if (!name || !remotePath) return { message: "Usage: /ssh cat <name> <remote-path> [max-chars]" };
      if (!context.permissions.allowShell) {
        return { message: "SSH file access is disabled. Run /shell on or /permissions profile dev first." };
      }
      try {
        const profile = service.getProfile(name);
        if (!profile) return { message: `SSH profile not found: ${name}` };
        const maxChars = clampMaxChars(maxCharsText);
        const result = await readRemoteTextFile(profile, remotePath, {
          allowShell: context.permissions.allowShell,
          timeoutMs: 30_000,
          maxOutputChars: Math.max(8_000, maxChars * 2),
        });
        service.recordCommand(profile.name, result.output);
        return {
          message: [
            `${profile.name}:${result.remotePath} ${result.bytes} bytes`,
            (result.content ?? "").slice(0, maxChars),
          ].join("\n"),
          display: React.createElement(SshPanel, {
            model: sshOperationPanelModel({
              title: "SSH remote file",
              subtitle: profile.name,
              name: result.remotePath,
              status: "read",
              detail: `${result.bytes} bytes`,
              footer: `/ssh pull ${profile.name} ${result.remotePath} <local-path>`,
              preview: (result.content ?? "").split(/\r?\n/).slice(0, 6),
            }),
          }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("pull ")) {
      const [name, remotePath, localPath, overwriteFlag] = parseArgs(trimmed.slice("pull ".length));
      if (!name || !remotePath || !localPath) {
        return { message: "Usage: /ssh pull <name> <remote-path> <local-path> [--overwrite]" };
      }
      if (!context.permissions.allowShell) {
        return { message: "SSH file access is disabled. Run /shell on or /permissions profile dev first." };
      }
      try {
        const profile = service.getProfile(name);
        if (!profile) return { message: `SSH profile not found: ${name}` };
        const result = await pullRemoteTextFile(profile, remotePath, context.config.projectPath, localPath, {
          allowShell: context.permissions.allowShell,
          timeoutMs: 30_000,
          maxOutputChars: 256_000,
          overwrite: overwriteFlag === "--overwrite",
        });
        service.recordCommand(profile.name, result.output);
        return {
          message: `pulled ${result.bytes} bytes from ${profile.name}:${result.remotePath} to ${result.localPath}`,
          display: React.createElement(SshPanel, {
            model: sshOperationPanelModel({
              title: "SSH pull",
              subtitle: profile.name,
              name: result.remotePath,
              status: "ok",
              detail: `${result.bytes} bytes`,
              note: `to ${result.localPath}`,
              footer: `/diff file ${result.localPath}`,
            }),
          }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("push ")) {
      const [name, localPath, remotePath, overwriteFlag] = parseArgs(trimmed.slice("push ".length));
      if (!name || !localPath || !remotePath) {
        return { message: "Usage: /ssh push <name> <local-path> <remote-path> [--overwrite]" };
      }
      if (!context.permissions.allowShell) {
        return { message: "SSH file access is disabled. Run /shell on or /permissions profile dev first." };
      }
      try {
        const profile = service.getProfile(name);
        if (!profile) return { message: `SSH profile not found: ${name}` };
        const result = await pushRemoteTextFile(profile, context.config.projectPath, localPath, remotePath, {
          allowShell: context.permissions.allowShell,
          timeoutMs: 30_000,
          maxOutputChars: 8_000,
          overwrite: overwriteFlag === "--overwrite",
        });
        service.recordCommand(profile.name, result.output);
        return {
          message: `pushed ${result.bytes} bytes from ${result.localPath} to ${profile.name}:${result.remotePath}`,
          display: React.createElement(SshPanel, {
            model: sshOperationPanelModel({
              title: "SSH push",
              subtitle: profile.name,
              name: result.remotePath,
              status: "ok",
              detail: `${result.bytes} bytes`,
              note: `from ${result.localPath}`,
              footer: `/ssh cat ${profile.name} ${result.remotePath}`,
            }),
          }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("worker ")) {
      const [name, runSelector, maxTasksText] = parseArgs(trimmed.slice("worker ".length));
      if (!name || !runSelector) return { message: "Usage: /ssh worker <name> <run-id|attached> [max-tasks]" };
      if (!context.permissions.allowShell) {
        return { message: "SSH worker execution is disabled. Run /shell on or /permissions profile dev first." };
      }
      const runId = resolveRunId(runSelector, context);
      if (!runId) return { message: `Run not found: ${runSelector}` };
      const maxTasks = maxTasksText ? Number.parseInt(maxTasksText, 10) : undefined;
      try {
        const result = await new SshQueueWorker(context.state, context.config.projectPath).drain({
          runId,
          profileName: name,
          maxTasks,
          policy: {
            allowShell: context.permissions.allowShell,
            timeoutMs: 30_000,
            maxOutputChars: 8_000,
          },
        });
        return {
          message: [
            `ssh worker ${result.profileName} ${result.runId}: ${result.status}`,
            result.message,
            `steps=${result.steps.length}`,
            ...result.steps.map((step) =>
              `- ${step.status}${step.task ? ` ${step.task.id} ${step.task.agent}: ${step.task.title}` : ""}`,
            ),
          ].join("\n"),
          display: React.createElement(SshPanel, { model: sshWorkerPanelModel(result) }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed === "history" || trimmed.startsWith("history ")) {
      const limit = Number.parseInt(trimmed.slice("history".length).trim(), 10);
      const records = service.listCommandRecords(Number.isFinite(limit) ? limit : 20);
      if (records.length === 0) {
        return {
          message: "No SSH command history.",
          display: React.createElement(SshPanel, { model: sshHistoryPanelModel(records) }),
        };
      }
      return {
        message: records.map((record) => {
          const status = record.timedOut
            ? "timed-out"
            : record.exitCode === 0
              ? "exit=0"
              : `exit=${record.exitCode ?? "unknown"}`;
          return `${record.id} ${status} ${record.profileName} ${record.target} ${record.command}`;
        }).join("\n"),
        display: React.createElement(SshPanel, { model: sshHistoryPanelModel(records) }),
      };
    }
    if (trimmed === "sessions" || trimmed.startsWith("sessions ")) {
      const limit = Number.parseInt(trimmed.slice("sessions".length).trim(), 10);
      const sessions = service.listSessions(Number.isFinite(limit) ? limit : 20);
      if (sessions.length === 0) {
        return {
          message: "No SSH sessions recorded.",
          display: React.createElement(SshPanel, { model: sshSessionsPanelModel(sessions) }),
        };
      }
      return {
        message: sessions.map((session) =>
          `${session.id} ${session.status} ${session.profileName} ${session.target}`,
        ).join("\n"),
        display: React.createElement(SshPanel, { model: sshSessionsPanelModel(sessions) }),
      };
    }
    if (trimmed.startsWith("close ")) {
      const id = trimmed.slice("close ".length).trim();
      try {
        const session = service.close(id);
        return {
          message: `${session.id} ${session.status}`,
          display: React.createElement(SshPanel, { model: sshSessionsPanelModel([session]) }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("remove ")) {
      const name = trimmed.slice("remove ".length).trim();
      const removed = service.removeProfile(name);
      return {
        message: removed ? `removed ssh profile ${name}` : `SSH profile not found: ${name}`,
        display: removed ? React.createElement(SshPanel, {
          model: sshOperationPanelModel({
            title: "SSH profile removed",
            subtitle: name,
            name,
            status: "removed",
            detail: "profile removed from project ssh config",
            footer: "/ssh list",
            tone: "warning",
          }),
        }) : undefined,
      };
    }
    if (trimmed === "path") {
      return {
        message: service.path(),
        display: React.createElement(SshPanel, {
          model: sshOperationPanelModel({
            title: "SSH config path",
            subtitle: context.config.projectPath,
            name: "ssh.json",
            status: "path",
            detail: service.path(),
            footer: "/ssh list",
          }),
        }),
      };
    }
    return { message: "Usage: /ssh add|list|show|preview|health|run|cat|pull|push|worker|history|connect|sessions|close|remove|path" };
  },
};

function parseArgs(args: string): string[] {
  return [...args.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? "",
  );
}

function clampMaxChars(raw: string | undefined): number {
  const parsed = raw ? Number.parseInt(raw, 10) : 4_000;
  if (!Number.isFinite(parsed)) return 4_000;
  return Math.min(64_000, Math.max(1, parsed));
}
