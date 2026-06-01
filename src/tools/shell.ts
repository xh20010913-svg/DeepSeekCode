import { spawn } from "node:child_process";
import { safeOptionalJoin } from "./pathSafety.js";
import { DeepSeekCodeAbortError, throwIfAborted } from "../utils/abort.js";

export interface ShellPolicy {
  allowShell: boolean;
  maxTimeoutMs: number;
  maxOutputChars: number;
}

export interface CommandOutput {
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface CommandRunOptions {
  signal?: AbortSignal;
}

interface ShellInvocation {
  command: string;
  args: string[];
  shell: boolean;
}

export const defaultShellPolicy: ShellPolicy = {
  allowShell: false,
  maxTimeoutMs: 30_000,
  maxOutputChars: 8_000,
};

export function runCommand(
  root: string,
  command: string,
  cwd: string,
  timeoutMs: number,
  policy: ShellPolicy,
  options: CommandRunOptions = {},
): Promise<CommandOutput> {
  if (!policy.allowShell) {
    throw new Error("shell execution is disabled; enable it with /shell on");
  }
  throwIfAborted(options.signal);
  const resolvedCwd = safeOptionalJoin(root, cwd);
  const effectiveTimeout = Math.min(timeoutMs, policy.maxTimeoutMs);
  const invocation = shellInvocation(command);

  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: resolvedCwd,
      env: shellEnvironment(),
      shell: invocation.shell,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const collect = (chunk: Buffer, current: string) =>
      (current + chunk.toString()).slice(-policy.maxOutputChars);

    const cleanup = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    };

    const settleResolve = (output: CommandOutput) => {
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
      settleReject(new DeepSeekCodeAbortError(options.signal?.reason));
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = collect(chunk, stdout);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = collect(chunk, stderr);
    });
    child.on("error", settleReject);

    const timer = setTimeout(() => {
      timedOut = true;
      terminateChild();
    }, effectiveTimeout);
    if (options.signal?.aborted) onAbort();
    else options.signal?.addEventListener("abort", onAbort, { once: true });

    child.on("close", (exitCode) => {
      settleResolve({ cwd: resolvedCwd, exitCode, stdout, stderr, timedOut });
    });
  });
}

function shellInvocation(command: string): ShellInvocation {
  if (process.platform !== "win32") {
    return {
      command,
      args: [],
      shell: true,
    };
  }

  return {
    command: process.env.DEEPSEEKCODE_WINDOWS_SHELL ?? "powershell.exe",
    args: [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      windowsPowerShellCommand(command),
    ],
    shell: false,
  };
}

function shellEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PYTHONIOENCODING: process.env.PYTHONIOENCODING || "utf-8",
    PYTHONUTF8: process.env.PYTHONUTF8 || "1",
  };
}

function windowsPowerShellCommand(command: string): string {
  const normalized = invokeQuotedExecutable(command);
  return [
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "$OutputEncoding = [System.Text.Encoding]::UTF8",
    normalized,
  ].join("; ");
}

function invokeQuotedExecutable(command: string): string {
  const doubleQuoted = /^(\s*)("[^"]+"\s+.*)$/s.exec(command);
  if (doubleQuoted) return `${doubleQuoted[1] ?? ""}& ${doubleQuoted[2] ?? ""}`;

  const singleQuoted = /^(\s*)('[^']+'\s+.*)$/s.exec(command);
  if (singleQuoted) return `${singleQuoted[1] ?? ""}& ${singleQuoted[2] ?? ""}`;

  return command;
}

export function summarizeCommand(output: CommandOutput): string {
  const status = output.timedOut
    ? "timed out"
    : output.exitCode === 0
      ? "exit 0"
      : `exit ${output.exitCode ?? "unknown"}`;
  const text = [output.stdout.trim(), output.stderr.trim()].filter(Boolean).join("\n");
  return text ? `${status}\n${text}` : status;
}
