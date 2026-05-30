const copy = {
  zh: {
    navInstall: "安装",
    navCache: "缓存",
    navFeatures: "特性",
    navStart: "立即开始",
    heroTitle: "为 <em>DeepSeek</em> 缓存而生的 Code Agent。",
    heroLede:
      "DeepSeekCode 不是普通聊天壳。它把缓存命中、结构化工具、审批门、多 Agent 长任务和 Windows 终端输入体验放进同一个 TypeScript runtime。",
    heroPrimary: "立即开始",
    heroSecondary: "查看 Guide",
    metricCache: "live provider check",
    metricTests: "build checks",
    metricGates: "open gates",
    installTitle: "三条命令启动本地 Agent。",
    installText:
      "默认使用 deepseek-v4-flash 做低成本测试，适合先验证 TUI、工具执行和缓存策略。",
    copy: "复制",
    cacheTitle: "先预热上下文，再花 token。",
    cacheText:
      "DeepSeekCode 在大任务前先跑 no-model preflight：看稳定前缀、动态压力、cache pin、profile forecast 和 prompt churn。",
    featuresTitle: "不是 demo，是运行时骨架。",
    featureAction: "模型输出结构化动作，本地 runtime 再做路径、权限、工具和产物校验。",
    featureTui: "输入、删除、光标、队列、picker 和状态栏都按真实终端行为处理。",
    featureAgents: "Planner、Builder、Tester、Reviewer 的任务状态写入 SQLite，可 trace 和 rework。",
    featureApproval: "文件、shell、browser、MCP、plan 都可以先展示风险，再让用户决定。",
    featureMcp: "保留扩展边界，适配本地 skill、plugin manifest、stdio/HTTP MCP。",
    featureTelemetry: "记录 provider 返回的 cache hit/miss，并显示 shape drift 和准备建议。",
    archTitle: "DeepSeekCode 的工作循环。",
    roadmapTitle: "先前端体验，再后端深水区。",
    roadNow: "完善 TUI、官网、文档、cache guard 和 action-loop 稳定性。",
    roadNext: "加强 MCP、skills、plugins、browser snapshot、approval diff 和多 Agent rework。",
    roadLater: "长时间 worker、远程通道、桌面控制、文档/PDF/PPTX 工具和更完整的网站面板。",
    faqTitle: "常见问题。",
    faqOneQ: "DeepSeekCode 的技术架构是什么？",
    faqOneA:
      "核心是 TypeScript runtime：QueryEngine 负责对话和动作循环，Tools 执行本地能力，State 持久化 run/task/action/event，TUI 用 Ink/React 呈现交互。",
    faqTwoQ: "缓存命中是怎么优化的？",
    faqTwoA:
      "稳定规则、工具 schema、项目记忆、仓库 map 和 cache pin 放在 prompt 前段；用户当前输入、工具反馈和验证结果放在后段，减少稳定前缀漂移。",
    faqThreeQ: "怎么测试真实效果？",
    faqThreeA:
      "先跑 npm run typecheck 和 npm run build，再用 deepseek-v4-flash 在测试目录启动，观察 cache、tool、approval 和最终产物。",
  },
  en: {
    navInstall: "Install",
    navCache: "Cache",
    navFeatures: "Features",
    navStart: "Start",
    heroTitle: "A Code Agent built around <em>DeepSeek</em> cache stability.",
    heroLede:
      "DeepSeekCode is not a chat wrapper. It combines cache hits, typed tools, approval gates, multi-agent long-running work, and Windows-safe terminal input in one TypeScript runtime.",
    heroPrimary: "Start now",
    heroSecondary: "Read Guide",
    metricCache: "live provider check",
    metricTests: "build checks",
    metricGates: "open gates",
    installTitle: "Start the local agent in three commands.",
    installText:
      "Use deepseek-v4-flash for low-cost live tests before checking TUI behavior, tool execution, and cache strategy.",
    copy: "Copy",
    cacheTitle: "Warm context before spending tokens.",
    cacheText:
      "DeepSeekCode runs a no-model preflight before large tasks: stable prefix, dynamic pressure, cache pins, profile forecast, and prompt churn.",
    featuresTitle: "Not a demo. A runtime skeleton.",
    featureAction:
      "The model returns structured actions; the local runtime validates paths, permissions, tools, and artifacts.",
    featureTui:
      "Input, deletion, cursor movement, queued prompts, pickers, and status footer follow real terminal behavior.",
    featureAgents:
      "Planner, Builder, Tester, and Reviewer task states are stored in SQLite for trace and rework.",
    featureApproval:
      "Files, shell, browser, MCP, and plans can show risk before the user decides.",
    featureMcp:
      "Extension boundaries are ready for local skills, plugin manifests, and stdio/HTTP MCP.",
    featureTelemetry:
      "Provider cache hit/miss telemetry is tracked alongside shape drift and preparation advice.",
    archTitle: "The DeepSeekCode loop.",
    roadmapTitle: "Frontend feel first, backend depth next.",
    roadNow: "Polish TUI, website, docs, cache guard, and action-loop stability.",
    roadNext:
      "Strengthen MCP, skills, plugins, browser snapshots, approval diffs, and multi-agent rework.",
    roadLater:
      "Long-running workers, remote channels, desktop control, document/PDF/PPTX tools, and richer website panels.",
    faqTitle: "FAQ.",
    faqOneQ: "What is the DeepSeekCode architecture?",
    faqOneA:
      "DeepSeekCode is a TypeScript runtime: QueryEngine owns chat/action loops, Tools execute local capabilities, State persists runs/tasks/actions/events, and the TUI is built with Ink/React.",
    faqTwoQ: "How does cache optimization work?",
    faqTwoA:
      "Stable rules, tool schemas, project memory, repository maps, and cache pins stay early in the prompt; current user input, tool feedback, and validation results stay late to reduce prefix drift.",
    faqThreeQ: "How do I test the real behavior?",
    faqThreeA:
      "Run npm run typecheck and npm run build, then launch deepseek-v4-flash against a test directory and watch cache, tools, approvals, and output artifacts.",
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
