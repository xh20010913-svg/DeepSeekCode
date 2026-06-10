export interface CommandPreflightResult {
  ok: boolean;
  category?: string;
  reason?: string;
  suggestion?: string;
}

export interface CommandFailureDiagnosis {
  category: string;
  reason: string;
  suggestions: string[];
}

export interface LongRunningCommandDetection {
  detected: boolean;
  reason?: string;
  suggestion?: string;
}

export function preflightCommand(command: string): CommandPreflightResult {
  if (process.platform !== "win32") return { ok: true };
  const trimmed = command.trim();
  const suggestion = powershellSuggestion(trimmed);
  if (suggestion) {
    return {
      ok: false,
      category: "windows_shell_incompatible",
      reason: "The requested shell command uses POSIX/bash syntax, but run_command executes in Windows PowerShell.",
      suggestion,
    };
  }
  if (/(^|[^&])&&([^&]|$)|\|\|/.test(trimmed)) {
    return {
      ok: false,
      category: "windows_shell_incompatible",
      reason: "The command uses bash-style && or || chaining. DeepSeekCode runs finite commands in Windows PowerShell and needs failures to be explicit.",
      suggestion: [
        "Split chained commands into separate run_command actions, or use a PowerShell-safe guarded form.",
        "Example:",
        "npm.cmd install",
        "if ($LASTEXITCODE -eq 0) { npm.cmd run build }",
      ].join("\n"),
    };
  }
  if (/[|]/.test(trimmed) && /\b(grep|sed|awk|xargs|head|tail|wc)\b/.test(trimmed)) {
    return {
      ok: false,
      category: "windows_shell_incompatible",
      reason: "The command pipes to Unix text utilities that are not reliably available in Windows PowerShell.",
      suggestion: [
        "Use PowerShell pipeline commands instead:",
        "- Get-Content -Path <file> | Select-String -Pattern <pattern>",
        "- Get-ChildItem -Recurse | Select-String -Pattern <pattern>",
      ].join("\n"),
    };
  }
  if (/;\s*(cat|grep|touch|rm\s+-rf|cp\s+-r|mkdir\s+-p)\b/.test(trimmed)) {
    return {
      ok: false,
      category: "windows_shell_incompatible",
      reason: "The command chains Unix-style file operations after a semicolon. This is brittle in Windows PowerShell.",
      suggestion: "Split the commands into separate tool calls or replace the Unix command with the PowerShell-native equivalent shown by the failing subcommand.",
    };
  }
  if (/\b(cat|grep|touch)\b/.test(trimmed) || /\brm\s+-rf\b/.test(trimmed) || /\bcp\s+-r\b/.test(trimmed)) {
    return {
      ok: false,
      category: "windows_shell_incompatible",
      reason: "The command appears to use Unix utility syntax that is not reliably available in Windows PowerShell.",
      suggestion: [
        "Use PowerShell-native commands:",
        "- read files with Get-Content -Path <file>",
        "- search with Select-String -Pattern <pattern> -Path <file>",
        "- create files with New-Item -ItemType File -Force -Path <file>",
        "- remove directories with Remove-Item -Recurse -Force -LiteralPath <path>",
        "- copy directories with Copy-Item -Recurse -Force -Path <src> -Destination <dst>",
      ].join("\n"),
    };
  }
  if (/<<\s*['"]?\w+['"]?|\/dev\/null/.test(trimmed)) {
    return {
      ok: false,
      category: "windows_shell_incompatible",
      reason: "Here-documents and /dev/null redirection are bash features, not PowerShell features.",
      suggestion: "Use write_file/append_file for file creation, or PowerShell here-strings and Out-File if shell is necessary.",
    };
  }
  return { ok: true };
}

export function detectLongRunningCommand(command: string): LongRunningCommandDetection {
  const normalized = command.trim().toLowerCase();
  const patterns: Array<[RegExp, string]> = [
    [/\bnpm(\.cmd)?\s+run\s+(dev|start|serve)\b/, "npm dev/start scripts usually keep a server alive."],
    [/\b(pnpm|yarn)\s+(dev|start|serve)\b/, "package manager dev/start scripts usually keep a server alive."],
    [/\b(vite|next|nuxt|astro|webpack-dev-server|parcel|serve)\b/, "frontend dev server commands are long-running."],
    [/\bnode\s+.*(server|app|index)\.(js|mjs|cjs|ts)\b/, "node server entrypoints are often long-running."],
    [/\bpython\s+(-m\s+)?(http\.server|uvicorn|flask|django|manage\.py\s+runserver)\b/, "Python server commands are long-running."],
  ];
  for (const [pattern, reason] of patterns) {
    if (pattern.test(normalized)) {
      return {
        detected: true,
        reason,
        suggestion: "Use launch_project for long-running services so the runtime can keep the process alive, probe the URL/port, capture a preview, and return control to the model.",
      };
    }
  }
  return { detected: false };
}

export function classifyCommandFailure(output: { stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }): CommandFailureDiagnosis | undefined {
  const raw = `${output.stdout}\n${output.stderr}`;
  const text = raw.toLowerCase();
  if (output.timedOut) {
    return {
      category: "timeout",
      reason: "The command timed out before it completed.",
      suggestions: [
        "If this is a dev server, use launch_project or a shorter smoke-test command instead of waiting forever.",
        "If this is an install/build, inspect partial output and retry with a higher timeout only when progress is visible.",
      ],
    };
  }
  if (/eaddrinuse|address already in use|port .* already in use/.test(text)) {
    return {
      category: "port_in_use",
      reason: "The requested port is already in use.",
      suggestions: ["Retry on another port, or stop the existing process before launching again."],
    };
  }
  if (/node-gyp|gyp err|visual studio|msvs|prebuild-install|no longer maintained|node\.lib/.test(text)) {
    return {
      category: "native_dependency_build_failed",
      reason: "A native Node dependency failed to build on Windows.",
      suggestions: [
        "Prefer a pure JavaScript dependency or an in-memory/file fallback when the task can tolerate it.",
        "If the native dependency is required, tell the user the exact Visual Studio Build Tools or Node version requirement.",
        "Do not retry the same npm install loop without changing dependency strategy.",
      ],
    };
  }
  if (/rg(\.exe)?/.test(text) && /(access is denied|permission denied|operation not permitted|被拒绝|拒绝访问)/i.test(raw)) {
    return {
      category: "search_tool_blocked",
      reason: "ripgrep was blocked or denied by the local Windows environment.",
      suggestions: [
        "Use PowerShell-native search as a fallback: Get-ChildItem -Recurse | Select-String -Pattern <pattern>.",
        "For file listing, use Get-ChildItem -Recurse -File instead of retrying rg in a loop.",
        "If this is antivirus or policy related, report the blocked executable path instead of silently failing.",
      ],
    };
  }
  if (/github\.com|git push|origin head|schannel|could not resolve host|failed to connect|recv failure|connection was reset|unable to access/i.test(raw)) {
    return {
      category: "git_network_or_proxy",
      reason: "Git network access failed or the local proxy was not applied to this repository.",
      suggestions: [
        "Use local git with the repository proxy configured:",
        "git config http.proxy http://127.0.0.1:7897",
        "git config https.proxy http://127.0.0.1:7897",
        "Then retry: git push origin HEAD",
      ],
    };
  }
  if (/npm err|eresolve|enoent|econnreset|etimedout|network|socket hang up/.test(text)) {
    return {
      category: "dependency_install_failed",
      reason: "Dependency installation failed.",
      suggestions: [
        "Read the package manager error and decide whether to retry, switch dependencies, or reduce the generated project complexity.",
        "On network or registry failures, retry once with a clean command; on dependency conflicts, change package versions.",
      ],
    };
  }
  if (/not recognized as|commandnotfoundexception|is not recognized|cannot find path|找不到/.test(text)) {
    return {
      category: "command_not_found",
      reason: "The command is not available in the current Windows environment.",
      suggestions: ["Use the project-local npm script, a built-in runtime tool, or explain the missing external dependency."],
    };
  }
  return undefined;
}

export function formatPreflightFailure(command: string, result: CommandPreflightResult): string {
  return [
    "Command was not executed because it is incompatible with the current shell.",
    `category=${result.category ?? "windows_shell_incompatible"}`,
    `command=${command}`,
    `reason=${result.reason ?? "PowerShell cannot run this command reliably."}`,
    result.suggestion ? `suggestion:\n${result.suggestion}` : "",
  ].filter(Boolean).join("\n");
}

export function formatCommandFailureDiagnosis(diagnosis: CommandFailureDiagnosis): string {
  return [
    `category=${diagnosis.category}`,
    `reason=${diagnosis.reason}`,
    "next_steps:",
    ...diagnosis.suggestions.map((item) => `- ${item}`),
  ].join("\n");
}

export function formatFailureDiagnosis(diagnosis: CommandFailureDiagnosis | undefined): string {
  return diagnosis ? formatCommandFailureDiagnosis(diagnosis) : "";
}

function powershellSuggestion(command: string): string | undefined {
  let match = command.match(/^mkdir\s+-p\s+(.+)$/s);
  if (match) return `New-Item -ItemType Directory -Force -Path ${quotePowerShellArgs(match[1] ?? "")}`;
  match = command.match(/^cat\s+(.+)$/s);
  if (match) return `Get-Content -Path ${quotePowerShellArgs(match[1] ?? "")}`;
  match = command.match(/^touch\s+(.+)$/s);
  if (match) return `New-Item -ItemType File -Force -Path ${quotePowerShellArgs(match[1] ?? "")}`;
  match = command.match(/^rm\s+-rf\s+(.+)$/s);
  if (match) return `Remove-Item -Recurse -Force -LiteralPath ${quotePowerShellArgs(match[1] ?? "")}`;
  match = command.match(/^cp\s+-r\s+(.+?)\s+(.+)$/s);
  if (match) {
    return `Copy-Item -Recurse -Force -Path ${quotePowerShellArgs(match[1] ?? "")} -Destination ${quotePowerShellArgs(match[2] ?? "")}`;
  }
  match = command.match(/^ls\s+-la(?:\s+(.+))?$/s);
  if (match) return `Get-ChildItem -Force${match[1] ? ` -Path ${quotePowerShellArgs(match[1])}` : ""}`;
  return undefined;
}

function quotePowerShellArgs(value: string): string {
  const args = splitShellArgs(value);
  if (args.length === 0) return "''";
  if (args.length === 1) return quotePowerShellString(args[0]!);
  return `@(${args.map(quotePowerShellString).join(", ")})`;
}

function quotePowerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function splitShellArgs(value: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: "'" | "\"" | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) args.push(current);
  return args;
}
