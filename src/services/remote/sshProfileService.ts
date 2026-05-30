import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { SshCommandOutput } from "./sshRemoteExecutor.js";

export interface SshProfile {
  name: string;
  host: string;
  user?: string;
  port?: number;
  remotePath?: string;
}

export interface SshSessionRecord {
  id: string;
  profileName: string;
  target: string;
  status: SshSessionStatus;
  createdAtMs: number;
  updatedAtMs: number;
}

export type SshSessionStatus = "planned" | "connected" | "failed" | "closed";

export interface SshCommandRecord {
  id: string;
  profileName: string;
  target: string;
  command: string;
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  createdAtMs: number;
}

interface SshConfigFile {
  profiles: SshProfile[];
  sessions: SshSessionRecord[];
  commands: SshCommandRecord[];
}

export class SshProfileService {
  private readonly configPath: string;

  constructor(private readonly projectPath: string) {
    this.configPath = path.join(projectPath, ".deepseekcode", "ssh.json");
  }

  listProfiles(): SshProfile[] {
    return this.read().profiles.sort((a, b) => a.name.localeCompare(b.name));
  }

  getProfile(name: string): SshProfile | undefined {
    const normalized = normalizeSshName(name);
    return normalized ? this.read().profiles.find((profile) => profile.name === normalized) : undefined;
  }

  addProfile(input: {
    name: string;
    host: string;
    user?: string;
    port?: number;
    remotePath?: string;
    overwrite?: boolean;
  }): SshProfile {
    const name = normalizeSshName(input.name);
    if (!name) throw new Error("ssh profile name must use letters, numbers, dot, underscore, or dash");
    const host = input.host.trim();
    if (!host) throw new Error("ssh host is empty");
    const config = this.read();
    const existingIndex = config.profiles.findIndex((profile) => profile.name === name);
    if (existingIndex >= 0 && !input.overwrite) throw new Error(`ssh profile already exists: ${name}`);
    const profile: SshProfile = {
      name,
      host,
      user: input.user?.trim() || undefined,
      port: input.port,
      remotePath: input.remotePath?.trim() || undefined,
    };
    if (existingIndex >= 0) config.profiles[existingIndex] = profile;
    else config.profiles.push(profile);
    this.write(config);
    return profile;
  }

  removeProfile(name: string): boolean {
    const normalized = normalizeSshName(name);
    if (!normalized) return false;
    const config = this.read();
    const before = config.profiles.length;
    config.profiles = config.profiles.filter((profile) => profile.name !== normalized);
    if (config.profiles.length === before) return false;
    this.write(config);
    return true;
  }

  connect(name: string): SshSessionRecord {
    const profile = this.getProfile(name);
    if (!profile) throw new Error(`ssh profile not found: ${name}`);
    const now = Date.now();
    const session: SshSessionRecord = {
      id: `ssh_${randomUUID()}`,
      profileName: profile.name,
      target: formatSshTarget(profile),
      status: "planned",
      createdAtMs: now,
      updatedAtMs: now,
    };
    const config = this.read();
    config.sessions.push(session);
    this.write(config);
    return session;
  }

  close(id: string): SshSessionRecord {
    return this.updateSessionStatus(id, "closed");
  }

  updateSessionStatus(id: string, status: SshSessionStatus): SshSessionRecord {
    const config = this.read();
    const session = config.sessions.find((candidate) => candidate.id === id);
    if (!session) throw new Error(`ssh session not found: ${id}`);
    session.status = status;
    session.updatedAtMs = Date.now();
    this.write(config);
    return session;
  }

  listSessions(limit = 20): SshSessionRecord[] {
    return this.read().sessions
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, Math.max(1, limit));
  }

  recordCommand(profileName: string, output: SshCommandOutput): SshCommandRecord {
    const config = this.read();
    const record: SshCommandRecord = {
      id: `ssh_cmd_${randomUUID()}`,
      profileName,
      target: output.target,
      command: output.command,
      exitCode: output.exitCode,
      timedOut: output.timedOut,
      stdout: output.stdout,
      stderr: output.stderr,
      durationMs: output.durationMs,
      createdAtMs: Date.now(),
    };
    config.commands.push(record);
    this.write(config);
    return record;
  }

  listCommandRecords(limit = 20): SshCommandRecord[] {
    return this.read().commands
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, Math.max(1, limit));
  }

  preview(name: string): string {
    const profile = this.getProfile(name);
    if (!profile) throw new Error(`ssh profile not found: ${name}`);
    const parts = ["ssh"];
    if (profile.port) parts.push("-p", String(profile.port));
    parts.push(formatSshTarget(profile));
    if (profile.remotePath) parts.push(`# remotePath=${profile.remotePath}`);
    return parts.join(" ");
  }

  path(): string {
    return this.configPath;
  }

  private read(): SshConfigFile {
    if (!fs.existsSync(this.configPath)) return { profiles: [], sessions: [], commands: [] };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.configPath, "utf8")) as Partial<SshConfigFile>;
      return {
        profiles: Array.isArray(parsed.profiles) ? parsed.profiles.map(normalizeProfile).filter(Boolean) as SshProfile[] : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions.map(normalizeSession).filter(Boolean) as SshSessionRecord[] : [],
        commands: Array.isArray(parsed.commands) ? parsed.commands.map(normalizeCommandRecord).filter(Boolean) as SshCommandRecord[] : [],
      };
    } catch {
      return { profiles: [], sessions: [], commands: [] };
    }
  }

  private write(config: SshConfigFile): void {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    fs.writeFileSync(this.configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  }
}

export function normalizeSshName(name: string): string | null {
  const normalized = name.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(normalized)) return null;
  if (normalized.includes("..")) return null;
  return normalized;
}

export function formatSshTarget(profile: SshProfile): string {
  return profile.user ? `${profile.user}@${profile.host}` : profile.host;
}

function normalizeProfile(value: unknown): SshProfile | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? normalizeSshName(record.name) : null;
  const host = typeof record.host === "string" ? record.host.trim() : "";
  if (!name || !host) return null;
  return {
    name,
    host,
    user: typeof record.user === "string" && record.user.trim() ? record.user.trim() : undefined,
    port: typeof record.port === "number" && Number.isInteger(record.port) ? record.port : undefined,
    remotePath: typeof record.remotePath === "string" && record.remotePath.trim() ? record.remotePath.trim() : undefined,
  };
}

function normalizeSession(value: unknown): SshSessionRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.profileName !== "string" ||
    typeof record.target !== "string" ||
    !isSshSessionStatus(record.status)
  ) {
    return null;
  }
  return {
    id: record.id,
    profileName: record.profileName,
    target: record.target,
    status: record.status,
    createdAtMs: Number(record.createdAtMs ?? Date.now()),
    updatedAtMs: Number(record.updatedAtMs ?? record.createdAtMs ?? Date.now()),
  };
}

function isSshSessionStatus(value: unknown): value is SshSessionStatus {
  return value === "planned" || value === "connected" || value === "failed" || value === "closed";
}

function normalizeCommandRecord(value: unknown): SshCommandRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.profileName !== "string" ||
    typeof record.target !== "string" ||
    typeof record.command !== "string"
  ) {
    return null;
  }
  return {
    id: record.id,
    profileName: record.profileName,
    target: record.target,
    command: record.command,
    exitCode: record.exitCode === null ? null : Number(record.exitCode),
    timedOut: Boolean(record.timedOut),
    stdout: typeof record.stdout === "string" ? record.stdout : "",
    stderr: typeof record.stderr === "string" ? record.stderr : "",
    durationMs: Number(record.durationMs ?? 0),
    createdAtMs: Number(record.createdAtMs ?? Date.now()),
  };
}
