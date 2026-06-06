export type TechnicalErrorCategory =
  | "windows_shell_incompatible"
  | "native_dependency_build_failed"
  | "tool_schema_invalid"
  | "long_running_process"
  | "permission_waiting"
  | "timeout"
  | "port_in_use"
  | "dependency_install_failed"
  | "file_not_found"
  | "unknown";

export interface LocalizedText {
  zh: string;
  en: string;
}

export interface TechnicalErrorSummary {
  category: TechnicalErrorCategory;
  severity: "info" | "warning" | "error";
  title: LocalizedText;
  explanation: LocalizedText;
  suggestion: LocalizedText;
  firstLine: string;
  details: string;
}

const MAX_DETAIL_CHARS = 3600;

export function summarizeTechnicalError(value: string): TechnicalErrorSummary {
  const details = normalizeText(value).slice(0, MAX_DETAIL_CHARS);
  const lower = details.toLowerCase();
  const firstLine = firstMeaningfulLine(details);

  if (
    /\b(mkdir\s+-p|rm\s+-rf|cat\s+|touch\s+|cp\s+-r)\b/i.test(details) ||
    /\b(parsererror|parentcontainserrorrecordexception|parameterbindingexception|invalidendofline)\b/i.test(details) ||
    /\buses\s+posix\/bash\s+syntax\b/i.test(details)
  ) {
    return issue({
      category: "windows_shell_incompatible",
      title: {
        zh: "命令写法和当前 Windows shell 不兼容",
        en: "The command is not compatible with the current Windows shell",
      },
      explanation: {
        zh: "工具在 PowerShell 里执行，但命令像 bash/Linux 写法，所以这一步没有真正完成。",
        en: "The tool is running in PowerShell, but the command looks like bash/Linux syntax, so this step did not really complete.",
      },
      suggestion: {
        zh: "换成 PowerShell 写法，或改用文件工具和后台启动工具后重试。",
        en: "Use PowerShell-compatible commands, or switch to file tools/background launch and retry.",
      },
      firstLine,
      details,
    });
  }

  if (
    /\b(node-gyp|better-sqlite3|prebuild-install|vcinstalldir|visual studio|desktop development with c\+\+|msvs_version)\b/i.test(details) ||
    /\bnative dependency\b/i.test(details)
  ) {
    return issue({
      category: "native_dependency_build_failed",
      title: {
        zh: "本机原生依赖编译失败",
        en: "A native dependency failed to build locally",
      },
      explanation: {
        zh: "这类包需要 Visual Studio C++、node-gyp 或特定 Node 版本。普通用户机器经常没有这些组件。",
        en: "This package needs system build tools such as Visual Studio C++ or node-gyp, which are often absent on user machines.",
      },
      suggestion: {
        zh: "优先换成纯 JavaScript 依赖、内存或文件存储方案；如果必须使用原生包，再明确提示用户安装系统编译组件。",
        en: "Prefer a pure JavaScript dependency or an in-memory/file storage fallback; if native code is required, ask the user to install system build tools.",
      },
      firstLine,
      details,
    });
  }

  if (
    /\b(native tool call failed|invalid arguments for tool|local schema validation|unterminated string|unexpected end of json|invalid_type|expected.*received)\b/i.test(details) ||
    /"path"\s*:\s*\["to"\]/i.test(details)
  ) {
    return issue({
      category: "tool_schema_invalid",
      title: {
        zh: "模型传给工具的参数格式不合法",
        en: "The model sent invalid tool arguments",
      },
      explanation: {
        zh: "常见原因是一次写入内容过长、换行字符串没有正确转义，或必填字段缺失。",
        en: "Common causes are oversized writes, unescaped multiline strings, or missing required fields.",
      },
      suggestion: {
        zh: "把大文件拆成小块，先写骨架，再用 append 或 patch 分段补齐，然后重新验证。",
        en: "Split large files into smaller chunks, write a skeleton first, then append or patch and validate again.",
      },
      firstLine,
      details,
    });
  }

  if (/\b(eaddrinuse|address already in use|port .* already|端口.*占用)\b/i.test(details)) {
    return issue({
      category: "port_in_use",
      title: {
        zh: "端口已经被占用",
        en: "The port is already in use",
      },
      explanation: {
        zh: "另一个服务已经占用了当前端口，所以新服务没有干净启动。",
        en: "Another process is already using the target port, so the new service did not start cleanly.",
      },
      suggestion: {
        zh: "检查已有服务，复用它或换一个端口后再验证。",
        en: "Inspect the existing service, reuse it, or pick another port and verify again.",
      },
      firstLine,
      details,
    });
  }

  if (/\b(timed out|timeout|no progress|stale|still running|long-running|server started|listening on|localhost:\d+)\b/i.test(details)) {
    return issue({
      category: "long_running_process",
      severity: lower.includes("timed out") || lower.includes("timeout") ? "warning" : "info",
      title: {
        zh: "命令看起来是长驻服务",
        en: "The command appears to be a long-running service",
      },
      explanation: {
        zh: "开发服务器启动后通常不会退出；如果一直等待命令结束，主任务会看起来卡住。",
        en: "Dev servers usually keep running; waiting for run_command to exit makes the main task look stuck.",
      },
      suggestion: {
        zh: "改用后台启动或项目验收流程，并用浏览器或 health check 检查服务是否可访问。",
        en: "Use background launch or project verification, then check the service with a browser or health probe.",
      },
      firstLine,
      details,
    });
  }

  if (/\b(shell execution is disabled|permission|approval|denied|rejected|gate)\b/i.test(details)) {
    return issue({
      category: "permission_waiting",
      severity: "warning",
      title: {
        zh: "正在等待权限确认",
        en: "Waiting for permission",
      },
      explanation: {
        zh: "当前步骤需要执行受限工具，必须由用户批准后才能继续。",
        en: "This step needs a restricted tool and must wait for user approval.",
      },
      suggestion: {
        zh: "在权限面板或远程审批里选择允许、拒绝或停止任务。",
        en: "Use the permission panel or remote approval to allow, reject, or stop the task.",
      },
      firstLine,
      details,
    });
  }

  if (/\b(enoent|cannot find module|not found|could not read package\.json|找不到)\b/i.test(details)) {
    return issue({
      category: "file_not_found",
      title: {
        zh: "目标文件或模块不存在",
        en: "A required file or module was not found",
      },
      explanation: {
        zh: "命令访问的路径、入口文件或依赖模块不存在，可能是目录不对或前一步没有生成成功。",
        en: "The command referenced a missing path, entry file, or module. The working directory may be wrong or an earlier generation step failed.",
      },
      suggestion: {
        zh: "先确认项目目录和入口文件，再补齐缺失文件或重新安装依赖。",
        en: "Check the project directory and entry files, then create missing files or reinstall dependencies.",
      },
      firstLine,
      details,
    });
  }

  if (/\b(npm err|npm error|install failed|dependency|dependencies)\b/i.test(details)) {
    return issue({
      category: "dependency_install_failed",
      title: {
        zh: "依赖安装失败",
        en: "Dependency installation failed",
      },
      explanation: {
        zh: "项目依赖没有安装成功，因此后续构建、启动或验收可能继续失败。",
        en: "Project dependencies were not installed successfully, so later build, launch, or validation steps may fail.",
      },
      suggestion: {
        zh: "查看第一条 npm 错误，调整依赖版本，或换成更容易在当前系统安装的方案。",
        en: "Read the first npm error, adjust dependency versions, or choose a dependency that installs cleanly on this system.",
      },
      firstLine,
      details,
    });
  }

  return issue({
    category: "unknown",
    severity: lower.includes("failed") || lower.includes("error") ? "error" : "warning",
    title: {
      zh: "这个步骤遇到问题，需要进一步处理",
      en: "This step needs attention",
    },
    explanation: {
      zh: "工具返回了失败或异常信息，但暂时无法可靠归类。",
      en: "The tool returned failure or diagnostic output that could not be classified reliably.",
    },
    suggestion: {
      zh: "保留第一行错误和关键上下文，让模型换策略或进一步检查。",
      en: "Keep the first error line and key context, then let the model change strategy or inspect further.",
    },
    firstLine,
    details,
  });
}

export function formatTechnicalErrorForTerminal(value: string, options: { maxRawLines?: number } = {}): string {
  const summary = summarizeTechnicalError(value);
  const rawLines = summary.details
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(0, options.maxRawLines ?? 4);
  return [
    `问题   ${summary.title.zh}`,
    `原因   ${summary.explanation.zh}`,
    `建议   ${summary.suggestion.zh}`,
    summary.firstLine ? `首行   ${summary.firstLine}` : "",
    rawLines.length ? "详情   展开日志或查看 run trace 可看完整输出；这里仅保留前几行。" : "",
    ...rawLines.map((line) => `  ${clip(line, 180)}`),
  ].filter(Boolean).join("\n");
}

export function firstMeaningfulLine(value: string): string {
  const line = normalizeText(value)
    .split(/\r?\n/)
    .map((candidate) => candidate.trim())
    .find((candidate) =>
      candidate &&
      !/^[\W_]+$/.test(candidate) &&
      !/^npm (notice|warn cleanup)$/i.test(candidate)
    );
  return line ? clip(line, 220) : "";
}

export function compactHumanIssue(value: string, language: "zh" | "en" = "zh"): string {
  const summary = summarizeTechnicalError(value);
  return issueLabel(summary, language);
}

export function issueLabel(summary: TechnicalErrorSummary, language: "zh" | "en" = "zh"): string {
  return `${summary.title[language]} - ${summary.suggestion[language]}`;
}

export function looksLikeTechnicalIssue(value: string): boolean {
  return /\b(failed|error|invalid|denied|rejected|timeout|timed out|node-gyp|better-sqlite3|prebuild-install|visual studio|native tool call|schema validation|unexpected end of json|unterminated string|parsererror|parameterbindingexception|eaddrinuse|enoent|npm err|npm error|shell execution is disabled)\b/i.test(value);
}

function issue(input: Omit<TechnicalErrorSummary, "severity"> & { severity?: TechnicalErrorSummary["severity"] }): TechnicalErrorSummary {
  return {
    severity: input.severity ?? "error",
    category: input.category,
    title: input.title,
    explanation: input.explanation,
    suggestion: input.suggestion,
    firstLine: input.firstLine,
    details: input.details,
  };
}

function normalizeText(value: string): string {
  return value.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "").replace(/\r/g, "\n").trim();
}

function clip(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 3)}...`;
}
