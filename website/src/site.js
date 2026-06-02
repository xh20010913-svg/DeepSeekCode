const copy = {
  zh: {
    navQuickstart: "快速开始",
    navCapabilities: "能力矩阵",
    navMemory: "长期记忆",
    navExtensions: "扩展",
    navTesting: "真实测试",
    heroEyebrow: "DeepSeek 优先的本地 Agent 运行时",
    heroTitle: "DeepSeekCode",
    heroLede:
      "面向本地项目开发、办公文档生成和长任务协作的终端 Agent。v0.2.1 公开说明以真实接入能力为准：native tool calling、本地 typed tools、SQLite 持久状态、TencentDB-Agent-Memory 长期记忆、skills/plugins、权限 gate、缓存与费用遥测。",
    heroPrimary: "快速开始",
    heroSecondary: "阅读中文说明书",
    heroCaption: "DeepSeekCode 在 Windows Terminal 中运行",
    statusNative: "要求 native tool calls",
    statusJson: "无 JSON planner fallback",
    statusMemory: "内置 TencentDB-Agent-Memory",
    statusChinese: "中文默认",
    quickTitle: "在独立项目目录中运行。",
    quickText: "源码仓库只用于构建和发布；真实任务、测试产物和运行数据应放在单独的项目目录。",
    loopTitle: "主链路使用 native tools 驱动本地执行。",
    capTitle: "能力矩阵只描述已经接入或明确保留的功能。",
    memoryTitle: "长期记忆进入实际运行链路。",
    memoryText:
      "DeepSeekCode 内置 TencentDB-Agent-Memory 的 MIT runtime。模型调用前召回相关偏好、项目事实和历史决策；成功回合结束后捕获对话并提取结构化记忆。默认使用本地 SQLite，embedding 和 Tencent Cloud VectorDB 需要显式配置。",
    extTitle: "Skills 和 plugins 写入 .deepseekcode。",
    extText:
      "支持本地路径、GitHub URL、Git URL 和 file:// Git 源。可以兼容读取 .claude skill/plugin，但安装目标是 DeepSeekCode 自己的运行目录。",
    testTitle: "真实测试要按用户自然任务执行。",
    testWeb: "大型网站，多轮继续完善，browser 验证",
    testPpt: "答辩 PPT、课程 PPT、OFDR 原理 PPT",
    testDocx: "DOCX 项目报告",
    testRepair: "失败后诊断与自修复",
    testAgent: "Planner/Builder/Tester/Reviewer 多 Agent",
    testResume: "CLI 重启后 --continue / --resume",
    reportTitle: "场景报告用于判断能力和成本。",
    reportText: "报告包含模型、token、cache hit/miss、工具次数、产物、失败点和修复建议。",
    copy: "复制",
    copied: "已复制",
    selectText: "请手动选择",
  },
  en: {
    navQuickstart: "Quickstart",
    navCapabilities: "Capabilities",
    navMemory: "Memory",
    navExtensions: "Extensions",
    navTesting: "Tests",
    heroEyebrow: "DeepSeek-first local agent runtime",
    heroTitle: "DeepSeekCode",
    heroLede:
      "A terminal agent runtime for local project work, office artifacts, and long-running collaboration. v0.2.1 documents only the capabilities that are wired or explicitly reserved: native tool calling, typed local tools, durable SQLite state, TencentDB-Agent-Memory, skills/plugins, permission gates, and cache/cost telemetry.",
    heroPrimary: "Quickstart",
    heroSecondary: "Read the manual",
    heroCaption: "DeepSeekCode running in Windows Terminal",
    statusNative: "native tool calls required",
    statusJson: "no JSON planner fallback",
    statusMemory: "TencentDB-Agent-Memory built in",
    statusChinese: "Chinese by default",
    quickTitle: "Run against a separate project directory.",
    quickText: "Keep the source repository for build and release work; run real tasks and artifacts in a separate project directory.",
    loopTitle: "The main loop is driven by native tools.",
    capTitle: "The matrix lists only wired or explicitly reserved capabilities.",
    memoryTitle: "Long-term memory is part of the runtime loop.",
    memoryText:
      "DeepSeekCode vendors the MIT TencentDB-Agent-Memory runtime. Before model calls it recalls relevant preferences, project facts, and decisions; after successful turns it captures conversations and extracts structured memories. Local SQLite is the default. Embeddings and Tencent Cloud VectorDB require explicit configuration.",
    extTitle: "Skills and plugins install under .deepseekcode.",
    extText:
      "Local paths, GitHub URLs, Git URLs, and file:// Git sources are supported. .claude skills/plugins can be read for compatibility, while installed copies are written to DeepSeekCode runtime directories.",
    testTitle: "Real tests should match natural user tasks.",
    testWeb: "Large website, multi-turn improvements, browser validation",
    testPpt: "Defense PPT, course PPT, OFDR principles PPT",
    testDocx: "DOCX project report",
    testRepair: "Diagnosis and self-repair after failure",
    testAgent: "Planner/Builder/Tester/Reviewer multi-agent flow",
    testResume: "CLI restart with --continue / --resume",
    reportTitle: "Scenario reports show capability and cost.",
    reportText: "Reports include model, tokens, cache hit/miss, tool counts, artifacts, failures, and recommendations.",
    copy: "Copy",
    copied: "Copied",
    selectText: "Select text",
  },
};

function activeLanguage() {
  const saved = localStorage.getItem("deepseekcode-site-lang");
  return saved === "en" ? "en" : "zh";
}

function setLanguage(lang) {
  const normalized = lang === "en" ? "en" : "zh";
  const table = copy[normalized];
  document.documentElement.lang = normalized === "en" ? "en" : "zh-CN";
  for (const node of document.querySelectorAll("[data-i18n]")) {
    const key = node.getAttribute("data-i18n");
    if (key && table[key]) node.textContent = table[key];
  }
  for (const button of document.querySelectorAll(".lang")) {
    button.classList.toggle("is-active", button.dataset.lang === normalized);
  }
  localStorage.setItem("deepseekcode-site-lang", normalized);
}

for (const button of document.querySelectorAll(".lang")) {
  button.addEventListener("click", () => setLanguage(button.dataset.lang || "zh"));
}

for (const button of document.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    const target = document.querySelector(button.dataset.copy || "");
    if (!target) return;
    const original = button.textContent;
    const table = copy[activeLanguage()];
    try {
      await navigator.clipboard.writeText(target.textContent || "");
      button.textContent = table.copied;
      setTimeout(() => {
        button.textContent = original;
      }, 1200);
    } catch {
      button.textContent = table.selectText;
    }
  });
}

setLanguage(activeLanguage());
