import { spawn } from "node:child_process";
import type { SshProfile } from "./sshProfileService.js";
import { formatSshTarget } from "./sshProfileService.js";
import { DeepSeekCodeAbortError, throwIfAborted } from "../../utils/abort.js";

export interface SshCommandOutput {
  command: string;
  target: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export interface SshExecutionPolicy {
  allowShell: boolean;
  timeoutMs?: number;
  maxOutputChars?: number;
  sshBin?: string;
  sshBinArgs?: string[];
  stdin?: string | Buffer;
  signal?: AbortSignal;
}

export function buildSshArgs(profile: SshProfile, command: string): string[] {
  const args: string[] = [
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
  ];
  if (profile.port) args.push("-p", String(profile.port));
  args.push(formatSshTarget(profile), buildRemoteCommand(profile, command));
  return args;
}

export function buildRemoteCommand(profile: SshProfile, command: string): string {
  const trimmed = command.trim();
  if (!trimmed) throw new Error("remote command is empty");
  if (!profile.remotePath) return trimmed;
  return `cd ${quoteForRemoteShell(profile.remotePath)} && ${trimmed}`;
}

export function runSshCommand(
  profile: SshProfile,
  command: string,
  policy: SshExecutionPolicy,
): Promise<SshCommandOutput> {
  if (!policy.allowShell) {
    throw new Error("SSH execution is disabled. Run /shell on or /permissions profile dev first.");
  }
  throwIfAborted(policy.signal);
  const sshBin = policy.sshBin ?? process.env.DEEPSEEKCODE_SSH_BIN ?? "ssh";
  const sshBinArgs = policy.sshBinArgs ?? sshBinArgsFromEnv();
  const args = buildSshArgs(profile, command);
  const timeoutMs = Math.min(Math.max(policy.timeoutMs ?? 30_000, 100), 120_000);
  const maxOutputChars = Math.max(1, policy.maxOutputChars ?? 8_000);
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(sshBin, [...sshBinArgs, ...args], {
      windowsHide: true,
      stdio: [policy.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const collect = (chunk: Buffer, current: string) =>
      (current + chunk.toString()).slice(-maxOutputChars);

    const cleanup = () => {
      clearTimeout(timer);
      policy.signal?.removeEventListener("abort", onAbort);
    };

    const settleResolve = (output: SshCommandOutput) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(output);
    };

    const settleReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const terminateChild = () => {
      if (!child.killed) child.kill();
      if (process.platform === "win32" && child.pid) {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        }).unref();
      }
    };

    const onAbort = () => {
      terminateChild();
      settleReject(new DeepSeekCodeAbortError(policy.signal?.reason));
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = collect(chunk, stdout);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = collect(chunk, stderr);
    });
    if (policy.stdin !== undefined) {
      child.stdin?.on("error", () => undefined);
      child.stdin?.end(policy.stdin);
    }
    child.on("error", settleReject);

    const timer = setTimeout(() => {
      timedOut = true;
      terminateChild();
    }, timeoutMs);
    if (policy.signal?.aborted) onAbort();
    else policy.signal?.addEventListener("abort", onAbort, { once: true });

    child.on("close", (exitCode) => {
      settleResolve({
        command,
        target: formatSshTarget(profile),
        exitCode,
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

export function summarizeSshCommand(output: SshCommandOutput): string {
  const status = output.timedOut
    ? "timed out"
    : output.exitCode === 0
      ? "exit 0"
      : `exit ${output.exitCode ?? "unknown"}`;
  const text = [output.stdout.trim(), output.stderr.trim()].filter(Boolean).join("\n");
  return text ? `${status} ${output.target}\n${text}` : `${status} ${output.target}`;
}

export function quoteForRemoteShell(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function sshBinArgsFromEnv(): string[] {
  const raw = process.env.DEEPSEEKCODE_SSH_BIN_ARGS?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return raw.split(/\s+/).filter(Boolean);
  }
}
