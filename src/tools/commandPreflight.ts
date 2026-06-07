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
        "npm.cmd run build",
        "For long-running services, use launch_project instead of chaining after install/build.",
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
        "- Measure-Object for counts, Select-Object -First/-Last for head/tail behavior",
      ].join("\n"),
    };
  }
  if (/;\s*(mkdir\s+-p|rm\s+-rf|cat\b|touch\b|cp\s+-r|grep\b|sed\b|awk\b)/.test(trimmed)) {
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
        "- remove with Remove-Item -Recurse -Force -LiteralPath <path>",
        "- copy with Copy-Item -Recurse -Force -Path <src> -Destination <dst>",
      ].join("\n"),
    };
  }
  if (/<<\s*['"]?\w+['"]?/.test(trimmed) || /\b2>\/dev\/null\b/.test(trimmed)) {
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
  const normalized = command.trim().replace(/\s+/g, " ").toLowerCase();
  if (!normalized) return { detected: false };
  const patterns: Array<[RegExp, string]> = [
    [/\bnpm(?:\.cmd)?\s+run\s+(dev|serve|preview)\b/, "npm dev/serve/preview scripts usually keep a local service running."],
    [/\bnpm(?:\.cmd)?\s+(start)\b/, "npm start often launches a long-running local service."],
    [/\bnode\s+[\w./\\-]*(server|app|index|main)\.(c?m?js|ts)\b/, "node server-style entry points often keep listening instead of exiting."],
    [/\b(vite|next\s+dev|next\s+start|react-scripts\s+start|vue-cli-service\s+serve|astro\s+dev|svelte-kit\s+dev)\b/, "frontend and app server commands are long-running dev services."],
    [/\b(python|py)\s+-m\s+http\.server\b/, "python -m http.server is a long-running static file server."],
    [/\b(flask\s+run|uvicorn\s+[\w.:_-]+|streamlit\s+run)\b/, "web service commands keep running until stopped."],
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
  const text = `${output.stdout}\n${output.stderr}`.toLowerCase();
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
  if (/not recognized as|commandnotfoundexception|is not recognized|找不到/.test(text)) {
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

export function formatFailureDiagnosis(diagnosis: CommandFailureDiagnosis | undefined): string {
  if (!diagnosis) return "";
  return [
    `diagnosis=${diagnosis.category}`,
    `reason=${diagnosis.reason}`,
    "next_steps:",
    ...diagnosis.suggestions.map((item) => `- ${item}`),
  ].join("\n");
}

function powershellSuggestion(command: string): string | undefined {
  let match = command.match(/^mkdir\s+-p\s+(.+)$/s);
  if (match) {
    return `New-Item -ItemType Directory -Force -Path ${quotePowerShellArgs(match[1] ?? "")}`;
  }
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
