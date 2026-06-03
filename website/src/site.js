const copy = {
  zh: {
    navInstall: "安装",
    navCache: "缓存",
    navFeatures: "能力",
    navStart: "开始使用",
    heroTitle: "围绕 <em>DeepSeek</em> 缓存稳定性构建的 Code Agent。",
    heroLede:
      "DeepSeekCode 不是聊天壳。它把稳定 prompt 前缀、DeepSeek native tool calls、会话恢复、工具结果压缩、权限 gate 和 Windows 终端体验放进同一个 TypeScript runtime。",
    heroPrimary: "立即开始",
    heroSecondary: "查看 Guide",
    metricCache: "live cache check",
    metricTests: "release checks",
    metricGates: "open gates",
    installTitle: "三步启动本地 Agent。",
    installText:
      "先在独立测试目录里使用 deepseek-v4-flash 验证工具执行、会话恢复、缓存命中和产物生成。",
    copy: "复制",
    cacheTitle: "不要靠全量历史硬撑长任务。",
    cacheText:
      "DeepSeekCode 会把旧历史压成 conversation summary、tool_result_summary 和 runtime_run_state，并把稳定前缀保持在 prompt 前段。",
    featuresTitle: "这次发布重点修正本地工具链路和 TUI 交互。",
    featureAction:
      "模型通过 DeepSeek native tool calls 发起本地工具，本地 runtime 负责权限、校验、执行、tool result 回放和失败反馈。",
    featureTui:
      "TUI 默认中文，支持模型选择、输入历史、滚动 transcript、权限选择框和 shell/plan/question gate。",
    featureAgents:
      "Planner、Builder、Tester、Reviewer 的角色反馈使用 compact tool summary，并写入 agent progress checkpoint。",
    featureApproval:
      "文件、shell、browser、MCP、plan 都可以进入审批或验证门，状态写入 SQLite。",
    featureMcp:
      "保留 skills、plugins、MCP、Office 产物和 browser action 的扩展边界。",
    featureTelemetry:
      "记录 provider cache hit/miss、prompt shape、run progress 和真实测试审计结果。",
    archTitle: "DeepSeekCode 的后端工作流。",
    roadmapTitle: "下一步继续补真实 Agent 能力。",
    roadNow:
      "已接通 native tool calls、本地工具 registry、tool_result 压缩、runtime_run_state、skills/plugins 基础路径和 TencentDB-Agent-Memory。",
    roadNext:
      "继续增强真实场景评测、后台 worker pool、Office/PPT 质量、浏览器验证、TUI 键鼠验收和大型项目稳定性。",
    roadLater:
      "补更完整的插件生态、浏览器自动化、远程执行、长任务 worker 和更细的 token/cache 优化。",
    faqTitle: "常见问题。",
    faqOneQ: "DeepSeekCode 现在的核心链路是什么？",
    faqOneA:
      "QueryEngine 负责分类和 action loop，Tools 执行本地能力，StateStore 持久化 run/task/action/event，SessionStorage 保存对话和 compact tool result。",
    faqTwoQ: "怎么降低历史对话的 token 消耗？",
    faqTwoA:
      "不全量塞历史。稳定规则和工具 schema 放前面吃缓存；最近几轮保留；旧对话压成结构化摘要；工具输出只保留失败原因、路径、产物和关键结果。",
    faqThreeQ: "怎么验证不是只跑了基础检查？",
    faqThreeA:
      "公开版本只写已接通能力；真实任务、prompt audit、产物验证和失败点会继续放在独立测试目录中，不作为完成度宣传。",
  },
  en: {
    navInstall: "Install",
    navCache: "Context",
    navFeatures: "Features",
    navStart: "Start",
    heroTitle: "A Code Agent built around <em>DeepSeek</em> cache stability.",
    heroLede:
      "DeepSeekCode is not a chat wrapper. It combines stable prompt prefixes, DeepSeek native tool calls, session restore, compact tool feedback, permission gates, and a Windows terminal runtime in TypeScript.",
    heroPrimary: "Start now",
    heroSecondary: "Read Guide",
    metricCache: "live cache check",
    metricTests: "release checks",
    metricGates: "open gates",
    installTitle: "Start the local agent in three steps.",
    installText:
      "Use deepseek-v4-flash against a separate test project before trusting tool execution, session restore, cache behavior, and generated artifacts.",
    copy: "Copy",
    cacheTitle: "Long tasks should not replay raw history forever.",
    cacheText:
      "DeepSeekCode compacts old history into conversation summaries, tool_result_summary records, and runtime_run_state while keeping stable prefix blocks early.",
    featuresTitle: "This release fixes the local tool loop and TUI interaction.",
    featureAction:
      "The model requests local tools through DeepSeek native tool calls; the runtime handles permissions, validation, execution, tool-result replay, and failure feedback.",
    featureTui:
      "The TUI defaults to Chinese and supports model selection, input history, transcript scrolling, and shell/plan/question approval gates.",
    featureAgents:
      "Planner, Builder, Tester, and Reviewer pass compact tool summaries and write agent progress checkpoints.",
    featureApproval:
      "Files, shell, browser, MCP, and plan actions can pass through approval or validation gates stored in SQLite.",
    featureMcp:
      "Skills, plugins, MCP, Office artifacts, and browser actions remain first-class extension boundaries.",
    featureTelemetry:
      "Provider cache hit/miss, prompt shape, run progress, and live test audit results are recorded.",
    archTitle: "The DeepSeekCode backend loop.",
    roadmapTitle: "Next: more real agent capability.",
    roadNow:
      "Connected native tool calls, the local tool registry, compact tool results, runtime_run_state, skills/plugins paths, and TencentDB-Agent-Memory.",
    roadNext:
      "Continue improving realistic scenario evaluation, worker pools, Office/PPT quality, browser validation, TUI keyboard/mouse acceptance, and large-project stability.",
    roadLater:
      "Richer plugin ecosystem, browser automation, remote execution, long-running workers, and finer token/cache optimization.",
    faqTitle: "FAQ.",
    faqOneQ: "What is the core DeepSeekCode loop?",
    faqOneA:
      "QueryEngine handles classification and the action loop, Tools execute local capabilities, StateStore persists run/task/action/event data, and SessionStorage keeps chat plus compact tool results.",
    faqTwoQ: "How does it reduce history token cost?",
    faqTwoA:
      "It does not replay everything. Stable rules and tool schemas stay early for cache reuse, recent turns are kept, old chat is summarized, and tool output is reduced to failures, paths, artifacts, and key results.",
    faqThreeQ: "How was this verified beyond basic checks?",
    faqThreeA:
      "Public docs describe connected capabilities only. Real task reports, prompt audit, artifact checks, and failure notes stay in the isolated test directory.",
  },
};

function setLanguage(lang) {
  const table = copy[lang] || copy.zh;
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    if (!table[key]) return;
    node.innerHTML = table[key];
  });
  document.querySelectorAll(".lang-btn").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.lang === lang);
  });
  localStorage.setItem("deepseekcode-site-lang", lang);
}

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.16 },
);

document.querySelectorAll(".reveal").forEach((node) => observer.observe(node));

document.querySelectorAll(".lang-btn").forEach((button) => {
  button.addEventListener("click", () => setLanguage(button.dataset.lang));
});

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const target = document.querySelector(button.dataset.copy);
    if (!target) return;
    const text = target.innerText;
    try {
      await navigator.clipboard.writeText(text);
      const original = button.innerText;
      button.innerText = "Copied";
      window.setTimeout(() => {
        button.innerText = original;
      }, 1200);
    } catch {
      button.innerText = "Select text";
    }
  });
});

setLanguage(localStorage.getItem("deepseekcode-site-lang") || "zh");
