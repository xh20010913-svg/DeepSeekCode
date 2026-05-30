import { spawn } from "node:child_process";
import { safeOptionalJoin } from "./pathSafety.js";

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
): Promise<CommandOutput> {
  if (!policy.allowShell) {
    throw new Error("shell execution is disabled; enable it with /shell on");
  }
  const resolvedCwd = safeOptionalJoin(root, cwd);
  const effectiveTimeout = Math.min(timeoutMs, policy.maxTimeoutMs);

  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: resolvedCwd,
      shell: true,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const collect = (chunk: Buffer, current: string) =>
      (current + chunk.toString()).slice(-policy.maxOutputChars);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = collect(chunk, stdout);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = collect(chunk, stderr);
    });
    child.on("error", reject);

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, effectiveTimeout);

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ cwd: resolvedCwd, exitCode, stdout, stderr, timedOut });
    });
  });
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
