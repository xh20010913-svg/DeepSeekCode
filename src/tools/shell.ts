import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import http from "node:http";
import https from "node:https";
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

export interface LongRunningCommandOutput extends CommandOutput {
  pid?: number;
  running: boolean;
  ready: boolean;
  url?: string;
  elapsedMs: number;
}

export interface LongRunningCommandOptions extends CommandRunOptions {
  port?: number;
  probeUrls?: string[];
}

export interface BackgroundProcessInfo {
  pid: number;
  cwd: string;
  command: string;
  startedAt: number;
  url?: string;
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

const backgroundProcesses = new Map<number, {
  child: ChildProcess;
  info: BackgroundProcessInfo;
}>();

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
      if (process.platform === "win32" && child.pid) {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        }).unref();
      }
      if (!child.killed) child.kill();
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

export function runLongRunningCommand(
  root: string,
  command: string,
  cwd: string,
  timeoutMs: number,
  policy: ShellPolicy,
  options: LongRunningCommandOptions = {},
): Promise<LongRunningCommandOutput> {
  if (!policy.allowShell) {
    throw new Error("shell execution is disabled; enable it with /shell on");
  }
  throwIfAborted(options.signal);
  const resolvedCwd = safeOptionalJoin(root, cwd);
  const effectiveTimeout = Math.min(timeoutMs, policy.maxTimeoutMs);
  const invocation = shellInvocation(command);
  const startedAt = Date.now();

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
    let exitCode: number | null = null;
    let timedOut = false;
    let settled = false;
    let probing = false;
    let lastUrl: string | undefined;

    const collect = (chunk: Buffer, current: string) =>
      (current + chunk.toString()).slice(-policy.maxOutputChars);

    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(probeTimer);
      options.signal?.removeEventListener("abort", onAbort);
    };

    const settleResolve = (output: LongRunningCommandOutput) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (output.running && output.pid) {
        detachBackgroundChild(child);
        backgroundProcesses.set(output.pid, {
          child,
          info: {
            pid: output.pid,
            cwd: resolvedCwd,
            command,
            startedAt,
            url: output.url,
          },
        });
      }
      resolve(output);
    };

    const settleReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const terminateChild = () => {
      if (process.platform === "win32" && child.pid) {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        }).unref();
      }
      if (!child.killed) child.kill();
    };

    const output = (ready: boolean, running: boolean): LongRunningCommandOutput => ({
      cwd: resolvedCwd,
      exitCode,
      stdout,
      stderr,
      timedOut,
      pid: child.pid,
      running,
      ready,
      url: lastUrl,
      elapsedMs: Date.now() - startedAt,
    });

    const onAbort = () => {
      terminateChild();
      settleReject(new DeepSeekCodeAbortError(options.signal?.reason));
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = collect(chunk, stdout);
      lastUrl = extractLocalUrl(`${stdout}\n${stderr}`, options.port) ?? lastUrl;
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = collect(chunk, stderr);
      lastUrl = extractLocalUrl(`${stdout}\n${stderr}`, options.port) ?? lastUrl;
    });
    child.on("error", settleReject);
    child.on("close", (code) => {
      exitCode = code;
      if (child.pid) backgroundProcesses.delete(child.pid);
      if (!settled) settleResolve(output(false, false));
    });

    const tryProbe = async () => {
      if (settled || probing) return;
      probing = true;
      try {
        const candidates = candidateProbeUrls(`${stdout}\n${stderr}`, options);
        for (const candidate of candidates) {
          if (await probeHttp(candidate, 900)) {
            lastUrl = candidate;
            settleResolve(output(true, true));
            return;
          }
        }
        if (serverLooksReady(`${stdout}\n${stderr}`)) {
          settleResolve(output(true, true));
        }
      } finally {
        probing = false;
      }
    };

    const probeTimer = setInterval(() => {
      void tryProbe();
    }, 500);
    const timer = setTimeout(() => {
      timedOut = true;
      const running = exitCode === null && !child.killed;
      if (running) {
        settleResolve(output(false, true));
      } else {
        settleResolve(output(false, false));
      }
    }, effectiveTimeout);
    if (options.signal?.aborted) onAbort();
    else options.signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function listBackgroundCommands(): BackgroundProcessInfo[] {
  return Array.from(backgroundProcesses.values()).map((entry) => ({ ...entry.info }));
}

export function stopBackgroundCommand(pid: number): boolean {
  const entry = backgroundProcesses.get(pid);
  if (entry) {
    entry.child.stdout?.removeAllListeners("data");
    entry.child.stderr?.removeAllListeners("data");
    entry.child.stdout?.destroy();
    entry.child.stderr?.destroy();
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // Process may already be gone.
      }
    }
  }
  if (entry && !entry.child.killed) entry.child.kill();
  backgroundProcesses.delete(pid);
  return true;
}

function detachBackgroundChild(child: ChildProcess): void {
  child.unref();
  (child.stdout as { unref?: () => void } | null)?.unref?.();
  (child.stderr as { unref?: () => void } | null)?.unref?.();
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

export function summarizeLongRunningCommand(output: LongRunningCommandOutput): string {
  const status = output.running
    ? output.ready
      ? "running and ready"
      : "running; readiness probe not confirmed"
    : output.exitCode === 0
      ? "exited 0"
      : `exited ${output.exitCode ?? "unknown"}`;
  const processLine = output.pid ? `pid=${output.pid}` : "";
  const urlLine = output.url ? `url=${output.url}` : "";
  const text = [output.stdout.trim(), output.stderr.trim()].filter(Boolean).join("\n");
  return [status, processLine, urlLine, `elapsedMs=${output.elapsedMs}`, text].filter(Boolean).join("\n");
}

function candidateProbeUrls(text: string, options: LongRunningCommandOptions): string[] {
  const urls = new Set<string>();
  for (const url of options.probeUrls ?? []) urls.add(normalizeLocalUrl(url));
  if (options.port) urls.add(`http://127.0.0.1:${options.port}`);
  const extracted = extractAllLocalUrls(text);
  for (const url of extracted) urls.add(url);
  for (const port of extractMentionedPorts(text)) urls.add(`http://127.0.0.1:${port}`);
  if (serverLooksReady(text) || /localhost|127\.0\.0\.1|0\.0\.0\.0|listening|server|vite|next/i.test(text)) {
    for (const port of [5173, 3000, 3001, 4173, 5000, 8000, 8080]) {
      urls.add(`http://127.0.0.1:${port}`);
    }
  }
  return Array.from(urls);
}

function extractLocalUrl(text: string, port?: number): string | undefined {
  const [first] = extractAllLocalUrls(text);
  if (first) return first;
  if (port) return `http://127.0.0.1:${port}`;
  const [mentionedPort] = extractMentionedPorts(text);
  if (mentionedPort) return `http://127.0.0.1:${mentionedPort}`;
  return undefined;
}

function extractAllLocalUrls(text: string): string[] {
  const urls: string[] = [];
  const pattern = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+(?:\/[^\s'"<>]*)?/gi;
  for (const match of text.matchAll(pattern)) {
    urls.push(normalizeLocalUrl(match[0] ?? ""));
  }
  return urls;
}

function extractMentionedPorts(text: string): number[] {
  const ports = new Set<number>();
  const patterns = [
    /\b(?:port|端口)\s*:?\s*(\d{2,5})\b/gi,
    /\blistening\s+(?:on|at)\s*:?\s*(\d{2,5})\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const port = Number(match[1]);
      if (port > 0 && port < 65_536) ports.add(port);
    }
  }
  return Array.from(ports);
}

function normalizeLocalUrl(url: string): string {
  return url.replace("://0.0.0.0:", "://127.0.0.1:");
}

function serverLooksReady(text: string): boolean {
  return /\b(listening|server running|running at|started|ready|compiled|local:|localhost|127\.0\.0\.1)\b/i.test(text);
}

function probeHttp(url: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 500);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}
