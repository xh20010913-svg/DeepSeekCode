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

export type LocalizedText = {
  zh: string;
  en: string;
};

export type TechnicalErrorSummary = {
  category: TechnicalErrorCategory;
  severity: "info" | "warning" | "error";
  firstLine: string;
  title: LocalizedText;
  explanation: LocalizedText;
  suggestion: LocalizedText;
  strategy: LocalizedText;
  details: string[];
};

type CategoryDefinition = {
  title: LocalizedText;
  explanation: LocalizedText;
  suggestion: LocalizedText;
  strategy: LocalizedText;
};

const CATEGORY_TEXT: Record<TechnicalErrorCategory, CategoryDefinition> = {
  windows_shell_incompatible: {
    title: { zh: "命令不适合当前 Windows shell", en: "Windows shell incompatibility" },
    explanation: {
      zh: "这一步用了 Linux/bash 写法，但当前运行环境是 Windows PowerShell 或 cmd。",
      en: "This step used Linux/bash syntax while the current environment is Windows PowerShell or cmd.",
    },
    suggestion: {
      zh: "改成 PowerShell 可执行写法，或者把切目录、建目录、管道等操作拆成独立命令。",
      en: "Rewrite it as PowerShell-compatible commands, or split directory changes, folder creation, and pipes into separate commands.",
    },
    strategy: {
      zh: "把命令转换成当前系统能执行的形式，然后重试同一步。",
      en: "Convert the command to a form this system can execute, then retry the same step.",
    },
  },
  native_dependency_build_failed: {
    title: { zh: "原生依赖编译失败", en: "Native dependency build failed" },
    explanation: {
      zh: "依赖包需要本机 C++/node-gyp 编译环境，或依赖本身不支持当前 Node 版本。",
      en: "A package needs a local C++/node-gyp build environment, or the dependency does not support the current Node version.",
    },
    suggestion: {
      zh: "优先换成纯 JavaScript 依赖、文件数据库或内存方案；确实需要原生依赖时再提示用户安装系统组件。",
      en: "Prefer a pure JavaScript dependency, file database, or in-memory fallback; ask for system build tools only when the native dependency is required.",
    },
    strategy: {
      zh: "避免反复安装同一个失败依赖，改用更稳定的实现方案。",
      en: "Avoid repeating the same failing install and switch to a more reliable implementation.",
    },
  },
  tool_schema_invalid: {
    title: { zh: "模型给工具的参数格式不合法", en: "Invalid tool arguments" },
    explanation: {
      zh: "常见原因是一次写入内容过长、换行字符串没有正确编码，或缺少必填字段。",
      en: "Common causes are overly large writes, incorrectly encoded multiline strings, or missing required fields.",
    },
    suggestion: {
      zh: "先写较小的骨架，再用 append 或 patch 分段补齐，并在每段后验证。",
      en: "Write a compact skeleton first, then append or patch in smaller chunks and validate after each chunk.",
    },
    strategy: {
      zh: "拆小本轮工具调用，保留完整错误给模型继续修复。",
      en: "Split this tool call into smaller calls and keep the full error available for repair.",
    },
  },
  long_running_process: {
    title: { zh: "服务可能已经启动", en: "Service may be running" },
    explanation: {
      zh: "启动命令进入了长期运行状态，通常表示服务或开发服务器在前台运行，不代表任务失败。",
      en: "The start command entered a long-running state, which usually means a service or dev server is running in the foreground.",
    },
    suggestion: {
      zh: "记录端口，用浏览器、健康检查或截图验证服务，而不是一直等待命令自然退出。",
      en: "Record the port and verify it with a browser, health check, or screenshot instead of waiting for the command to exit.",
    },
    strategy: {
      zh: "转入启动验证：检查端口、页面、控制台错误和关键功能。",
      en: "Move to launch validation: check the port, page, console errors, and key behavior.",
    },
  },
  permission_waiting: {
    title: { zh: "正在等待权限", en: "Waiting for permission" },
    explanation: {
      zh: "当前步骤需要用户批准 shell、浏览器、文件或远程操作权限。",
      en: "The current step needs user approval for shell, browser, file, or remote access.",
    },
    suggestion: {
      zh: "在权限面板里选择允许一次、本会话允许、拒绝或停止任务。",
      en: "Use the permission panel to allow once, allow for this session, reject, or stop the task.",
    },
    strategy: {
      zh: "暂停敏感操作，等待用户决定。",
      en: "Pause the sensitive action until the user decides.",
    },
  },
  timeout: {
    title: { zh: "步骤超时或疑似卡住", en: "Step timed out or may be stuck" },
    explanation: {
      zh: "一段时间内没有新的模型输出、工具结果或进度事件。",
      en: "No new model output, tool result, or progress event has arrived for a while.",
    },
    suggestion: {
      zh: "检查最近命令是否仍在运行；如果没有进展，重试当前步或停止任务。",
      en: "Check whether the latest command is still running; if no progress is visible, retry the step or stop the task.",
    },
    strategy: {
      zh: "标记卡住原因，并准备重试或交还用户决策。",
      en: "Mark the stale reason and prepare to retry or hand back to the user.",
    },
  },
  port_in_use: {
    title: { zh: "端口已被占用", en: "Port already in use" },
    explanation: {
      zh: "要启动的服务端口已经被其他进程占用。",
      en: "The port needed by the service is already occupied by another process.",
    },
    suggestion: {
      zh: "查找占用进程，或换一个空闲端口后重新启动并验证。",
      en: "Find the process using the port, or switch to a free port and verify again.",
    },
    strategy: {
      zh: "寻找可用端口并重新启动服务。",
      en: "Find an available port and restart the service.",
    },
  },
  dependency_install_failed: {
    title: { zh: "依赖安装失败", en: "Dependency install failed" },
    explanation: {
      zh: "包管理器安装依赖时失败，可能是网络、版本、锁文件、权限或依赖本身的问题。",
      en: "The package manager failed to install dependencies, possibly due to network, version, lockfile, permission, or package issues.",
    },
    suggestion: {
      zh: "读第一段关键错误，调整依赖或安装策略；不要无变化地反复执行同一个安装命令。",
      en: "Read the first key error, adjust dependencies or install strategy, and avoid repeating the same install command unchanged.",
    },
    strategy: {
      zh: "根据安装错误调整依赖方案。",
      en: "Adjust the dependency strategy based on the install error.",
    },
  },
  file_not_found: {
    title: { zh: "文件或目录不存在", en: "File or directory not found" },
    explanation: {
      zh: "命令或工具访问了不存在的路径，或者当前工作目录和预期不一致。",
      en: "A command or tool accessed a missing path, or the current working directory does not match the expected one.",
    },
    suggestion: {
      zh: "确认工作目录，先列出文件，再用绝对路径或正确的相对路径重试。",
      en: "Confirm the working directory, list files first, then retry with an absolute or correct relative path.",
    },
    strategy: {
      zh: "重新定位文件路径和项目目录。",
      en: "Recheck the file path and project directory.",
    },
  },
  unknown: {
    title: { zh: "执行步骤失败", en: "Execution step failed" },
    explanation: {
      zh: "当前工具或命令返回失败，需要根据第一行错误和完整日志继续判断。",
      en: "The current tool or command failed and needs diagnosis from the first error line and full logs.",
    },
    suggestion: {
      zh: "只向用户展示关键摘要，把完整日志保留在详情里，并把关键错误回放给模型修复。",
      en: "Show users only the key summary, keep full logs in details, and feed the key error back to the model for repair.",
    },
    strategy: {
      zh: "提取关键错误并准备修复。",
      en: "Extract the key error and prepare a fix.",
    },
  },
};

export function summarizeTechnicalError(input: unknown): TechnicalErrorSummary {
  const text = stringifyInput(input);
  const firstLine = firstMeaningfulLine(text);
  const category = classify(text);
  const definition = CATEGORY_TEXT[category];
  return {
    category,
    severity: category === "long_running_process" ? "info" : category === "permission_waiting" ? "warning" : "error",
    firstLine,
    title: definition.title,
    explanation: definition.explanation,
    suggestion: definition.suggestion,
    strategy: definition.strategy,
    details: meaningfulLines(text).slice(0, 12),
  };
}

export function formatTechnicalErrorForTerminal(
  input: unknown,
  localeOrOptions: "zh" | "en" | { locale?: "zh" | "en"; maxRawLines?: number } = "zh",
): string {
  const locale = typeof localeOrOptions === "string" ? localeOrOptions : (localeOrOptions.locale ?? "zh");
  const maxRawLines = typeof localeOrOptions === "string" ? 4 : (localeOrOptions.maxRawLines ?? 4);
  const summary = summarizeTechnicalError(input);
  const labels = locale === "zh"
    ? { issue: "问题", reason: "原因", next: "处理", first: "第一行", details: "详情", hidden: "完整日志已保留，这里只显示关键行。" }
    : { issue: "Issue", reason: "Why", next: "Next", first: "First", details: "Details", hidden: "Full logs are preserved; only key lines are shown here." };
  const lines = [
    `${labels.issue}   ${summary.title[locale]}`,
    `${labels.reason}   ${summary.explanation[locale]}`,
    `${labels.next}   ${summary.strategy[locale]}`,
    `${labels.first}   ${summary.firstLine || "(empty)"}`,
  ];
  if (summary.details.length > 1) {
    lines.push(`${labels.details}   ${labels.hidden}`);
    for (const line of summary.details.slice(1, Math.max(1, maxRawLines))) lines.push(`  ${line}`);
  }
  return lines.join("\n");
}

export function firstMeaningfulLine(input: unknown): string {
  return meaningfulLines(stringifyInput(input))[0] ?? "";
}

export function compactHumanIssue(input: unknown, locale: "zh" | "en" = "zh"): string {
  const summary = summarizeTechnicalError(input);
  return `${summary.title[locale]}: ${summary.explanation[locale]}${summary.firstLine ? ` first: ${summary.firstLine}` : ""}`;
}

export function issueLabel(input: unknown, locale: "zh" | "en" = "zh"): string {
  return summarizeTechnicalError(input).title[locale];
}

export function looksLikeTechnicalIssue(input: unknown): boolean {
  const text = stringifyInput(input).toLowerCase();
  return /failed|failure|error|invalid|denied|rejected|timeout|stale|exception|enoent|eaddrinuse|node-gyp|npm error|permission|找不到|失败|错误|异常|不兼容|权限|超时|卡住|占用|依赖|端口|编译/.test(text);
}

function classify(text: string): TechnicalErrorCategory {
  if (isWindowsShellMismatch(text)) return "windows_shell_incompatible";
  if (/node-gyp|better-sqlite3|prebuild-install|vcinstalldir|visual studio|desktop development with c\+\+|msvs_version|native dependency|native addon/i.test(text)) {
    return "native_dependency_build_failed";
  }
  if (/native tool call failed|invalid arguments for tool|local schema validation|unterminated string|unexpected end of json|invalid_type|expected.*received|"\s*path\s*"\s*:\s*\[\s*"to"\s*\]/i.test(text)) {
    return "tool_schema_invalid";
  }
  if (/server started|listening on|localhost:\d+|vite .*ready|compiled successfully|服务已启动|正常运行/i.test(text)) {
    return "long_running_process";
  }
  if (/eaddrinuse|port .*in use|address already in use|端口.*占用|端口已被占用/i.test(text)) {
    return "port_in_use";
  }
  if (/shell execution is disabled|permission|approval|pending gate|denied|rejected|waiting for user decision|权限|审批|等待用户/i.test(text)) {
    return "permission_waiting";
  }
  if (/timeout|timed out|stale|no progress|no dashboard event|疑似卡住|超时|卡住/i.test(text)) {
    return "timeout";
  }
  if (/enoent|cannot find module|not found|could not read package\.json|no such file|找不到|不存在|文件名、目录名/i.test(text)) {
    return "file_not_found";
  }
  if (/npm error|npm err|pnpm|yarn|install failed|dependency|dependencies|依赖|安装失败/i.test(text)) {
    return "dependency_install_failed";
  }
  return "unknown";
}

function isWindowsShellMismatch(text: string): boolean {
  const hasPosixCommand = /(^|\s)(mkdir\s+-p|rm\s+-rf|cat\s+|touch\s+|cp\s+-r|ls\s+-la)(\s|$)|&&|\|\||\|/.test(text);
  const hasWindowsSignal = /powershell|parsererror|parameterbindingexception|parentcontainserrorrecordexception|invalidendofline|windows|cmd\.exe|当前 shell|不兼容/i.test(text);
  return hasPosixCommand && hasWindowsSignal;
}

function meaningfulLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^-+$/.test(line))
    .map((line) => line.replace(/\s+/g, " "))
    .filter((line, index, lines) => index === 0 || line !== lines[index - 1]);
}

function stringifyInput(input: unknown): string {
  if (input == null) return "";
  if (typeof input === "string") return input;
  if (input instanceof Error) return `${input.message}\n${input.stack ?? ""}`;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}
