const copy = {
  zh: {
    navQuickstart: "快速开始",
    navCapabilities: "能力矩阵",
    navMemory: "长期记忆",
    navExtensions: "扩展",
    navTesting: "真实测试",
    heroEyebrow: "DeepSeek-first local agent runtime",
    heroTitle: "DeepSeekCode",
    heroLede: "一个运行在终端里的本地 Agent：native tool calling、本地 typed tools、SQLite 持久状态、TencentDB-Agent-Memory 长期记忆、skills/plugins、缓存费用 telemetry、真实用户场景测试。",
    heroPrimary: "开始使用",
    heroSecondary: "阅读说明书",
    heroCaption: "DeepSeekCode running in Windows Terminal",
    statusNative: "native tool calls required",
    statusJson: "no JSON planner fallback",
    statusMemory: "TencentDB-Agent-Memory 内置",
    statusChinese: "中文默认",
    quickTitle: "在独立项目目录启动。",
    quickText: "先构建源码，再把 Agent 指向你要测试或开发的项目目录。",
    loopTitle: "v0.2 使用 native tools 驱动本地工作。",
    capTitle: "只展示真实接入的能力。",
    memoryTitle: "长期记忆接入真实运行链路。",
    memoryText: "DeepSeekCode 内置 TencentDB-Agent-Memory 的 MIT runtime。每轮调用前召回相关偏好、决策和项目事实，成功回合结束后捕获对话并提取结构化记忆。默认本地 SQLite；embedding 和 Tencent Cloud VectorDB 需要显式配置。",
    extTitle: "扩展体系写入 .deepseekcode。",
    extText: "支持本地路径、GitHub URL、Git URL、file:// Git 源；兼容读取 .claude skill/plugin，但安装目标是 DeepSeekCode 自己的目录。",
    testTitle: "测试要像真实用户一样发任务。",
    testWeb: "大型网站，多轮继续完善，browser 验证",
    testPpt: "答辩 PPT、课程 PPT、OFDR 原理 PPT",
    testDocx: "DOCX 项目报告",
    testRepair: "失败后自修复",
    testAgent: "Planner/Builder/Tester/Reviewer 多 Agent",
    testResume: "CLI 重启后 --continue / --resume",
    reportTitle: "每个真实场景可导出报告。",
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
    heroLede: "A terminal local agent with native tool calling, typed local tools, durable SQLite state, TencentDB-Agent-Memory long-term memory, skills/plugins, cache and cost telemetry, and realistic scenario tests.",
    heroPrimary: "Start",
    heroSecondary: "Read manual",
    heroCaption: "DeepSeekCode running in Windows Terminal",
    statusNative: "native tool calls required",
    statusJson: "no JSON planner fallback",
    statusMemory: "TencentDB-Agent-Memory built in",
    statusChinese: "Chinese by default",
    quickTitle: "Start in a separate project directory.",
    quickText: "Build the source, then point the agent at the project you want to test or develop.",
    loopTitle: "v0.2 drives local work with native tools.",
    capTitle: "Only real wired capabilities are listed.",
    memoryTitle: "Long-term memory is wired into the runtime loop.",
    memoryText: "DeepSeekCode vendors the MIT TencentDB-Agent-Memory runtime. Before each model call it recalls relevant preferences, decisions, and project facts; after successful turns it captures the conversation and extracts structured memories. Local SQLite is the default; embeddings and Tencent Cloud VectorDB require explicit configuration.",
    extTitle: "Extensions install into .deepseekcode.",
    extText: "Local paths, GitHub URLs, Git URLs, and file:// Git sources are supported. .claude skills/plugins can be read for compatibility; installed copies go to DeepSeekCode directories.",
    testTitle: "Tests should look like real user tasks.",
    testWeb: "Large website, multi-turn improvements, browser validation",
    testPpt: "Defense PPT, course PPT, OFDR principles PPT",
    testDocx: "DOCX project report",
    testRepair: "Self-repair after failure",
    testAgent: "Planner/Builder/Tester/Reviewer multi-agent flow",
    testResume: "CLI restart with --continue / --resume",
    reportTitle: "Each scenario can export a report.",
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
