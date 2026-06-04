const copy = {
  zh: {
    navInstall: "安装",
    navFeatures: "能力",
    navRemote: "远程",
    navStart: "开始使用",
    heroTitle: "面向本地项目的 <em>DeepSeek</em> Code Agent runtime。",
    heroLede:
      "DeepSeekCode 把 DeepSeek native tool calls、本地文件和 shell 工具、权限 gate、长期记忆、会话恢复、远程微信控制和缓存感知上下文放在同一个 TypeScript runtime 里。它的目标是让模型真正能在项目目录里工作，而不是只给出建议。",
    heroPrimary: "安装启动",
    heroSecondary: "阅读 Guide",
    installTitle: "全局安装后，在任意项目目录直接启动。",
    installText:
      "进入项目目录运行 deepseekcode，当前目录就是项目根目录，状态写入该目录的 .deepseekcode。首次启动会询问是否开启本会话 shell 权限，真正执行命令时仍会走权限 gate。",
    copy: "复制",
    featuresTitle: "当前版本已经接通的核心能力。",
    featureAction:
      "模型通过 DeepSeek tools 数组请求本地工具；runtime 负责 Zod 校验、权限、执行、tool_result 回放和失败反馈，不再依赖模型输出大块 JSON 规划。",
    featureState:
      "每个项目目录有独立 .deepseekcode，保存 transcript、runs、events、artifacts、usage、approval gates 和 TencentDB-Agent-Memory。",
    featureRemote:
      "企业微信和个人微信 OpenClaw 都保留。远程端只显示简洁进度、权限审批、旁路问答和产物预览，不输出控制台日志。",
    featureAgents:
      "v0.2.7 新增 start_agent_workflow 等 native 工具，支持主 agent 设计角色、共享黑板、角色消息和验收角色。该能力仍标为实验中。",
    featureAsk:
      "长任务运行时可以用 /ask 做只读问答，查看进度、架构或阻塞点，不打断当前任务，也不写文件或执行 shell。",
    featureArtifacts:
      "远程产物回传由 runtime 根据真实文件类型规划。网页优先截图，Office/PDF 发可预览文件，源码项目发摘要、入口和 manifest。",
    remoteTitle: "电脑继续运行，微信只负责控制和看结果。",
    remoteText:
      "推荐先在项目目录启动 TUI，再通过 /remote-control 绑定微信。纯远程模式也可以用 deepseekcode --wechat 或 --wecom 启动。所有通道共享同一个项目 runtime，不另造一套 agent。",
    archTitle: "统一链路，而不是几个孤立功能。",
    roadmapTitle: "诚实标注仍在完善的部分。",
    roadNow:
      "native tool calling、本地文件工具、权限 gate、项目状态、TUI 基础、个人微信 OpenClaw 实验通道、TencentDB-Agent-Memory 和 npm 全局启动。",
    roadNext:
      "多 agent 编排、远程产物预览、browser 截图、MCP/skills 真实场景验收、长任务状态诊断和 worker pool。",
    roadLater:
      "个人微信 PC hook、完整 computer_use、完全后台化 worker pool 和更深的 GUI 自动化桥接。",
    faqTitle: "常见问题。",
    faqOneQ: "为什么不靠关键词判断用户要做什么？",
    faqOneA:
      "任务判断交给模型和 native tool calls。runtime 只负责权限、项目范围、状态、工具执行、产物类型识别和远程展示。",
    faqTwoQ: "长任务时怎么提问？",
    faqTwoA:
      "使用 /ask。它只读取当前 run 状态、最近事件和必要文件上下文，不写文件、不执行 shell，也不会污染主任务历史。",
    faqThreeQ: "微信端为什么不直接发所有文件？",
    faqThreeA:
      "微信更适合看简洁结果。HTML 优先发截图，Office/PDF 发可打开文件，多文件项目发摘要、入口和 manifest，避免刷屏。",
  },
  en: {
    navInstall: "Install",
    navFeatures: "Capabilities",
    navRemote: "Remote",
    navStart: "Start",
    heroTitle: "A <em>DeepSeek</em> Code Agent runtime for local projects.",
    heroLede:
      "DeepSeekCode puts DeepSeek native tool calls, local file and shell tools, permission gates, long-term memory, session restore, WeChat remote control, and cache-aware context into one TypeScript runtime. The goal is to let the model work inside a project directory instead of only giving advice.",
    heroPrimary: "Install",
    heroSecondary: "Read Guide",
    installTitle: "Install globally, then start in any project directory.",
    installText:
      "Run deepseekcode inside a project. The current directory becomes the project root and state is written to .deepseekcode. The TUI asks whether to enable shell for the current session, and actual commands still pass through permission gates.",
    copy: "Copy",
    featuresTitle: "Core capabilities connected in this release.",
    featureAction:
      "The model requests local tools through DeepSeek tools. The runtime validates with Zod, applies permissions, executes tools, replays tool results, and reports failures without relying on large JSON plans.",
    featureState:
      "Each project has its own .deepseekcode directory for transcripts, runs, events, artifacts, usage, approval gates, and TencentDB-Agent-Memory.",
    featureRemote:
      "WeCom and personal WeChat OpenClaw are both retained. Remote chat shows concise progress, approvals, side-channel answers, and artifact previews instead of terminal logs.",
    featureAgents:
      "v0.2.7 adds native workflow tools such as start_agent_workflow for role design, a shared blackboard, role messages, and a reviewer role. This remains experimental.",
    featureAsk:
      "Use /ask during long tasks for read-only questions about progress, architecture, or blockers without interrupting the active run or running tools.",
    featureArtifacts:
      "Remote artifact delivery is planned from real file types. HTML gets screenshots, Office/PDF gets previewable files, and code projects get summaries, entry files, and manifests.",
    remoteTitle: "Keep the computer running; use WeChat to control and inspect results.",
    remoteText:
      "Recommended flow: start the TUI in a project, then bind remote control with /remote-control. Pure remote mode is also available with deepseekcode --wechat or --wecom. All channels share the same project runtime.",
    archTitle: "One runtime chain, not isolated features.",
    roadmapTitle: "Honest status for unfinished work.",
    roadNow:
      "Native tool calling, local file tools, permission gates, project state, basic TUI, experimental personal WeChat OpenClaw, TencentDB-Agent-Memory, and global npm startup.",
    roadNext:
      "Multi-agent orchestration, remote artifact preview, browser screenshots, MCP/skills scenario testing, long-task diagnostics, and worker pools.",
    roadLater:
      "Personal WeChat PC hooks, complete computer_use, fully backgrounded worker pools, and deeper GUI automation bridges.",
    faqTitle: "FAQ.",
    faqOneQ: "Why not classify tasks with keywords?",
    faqOneA:
      "Task judgment belongs to the model and native tool calls. The runtime handles permissions, project bounds, state, tool execution, artifact typing, and remote display.",
    faqTwoQ: "How can I ask questions during a long task?",
    faqTwoA:
      "Use /ask. It reads the current run snapshot, recent events, and necessary file context without writing files, running shell, or polluting the main task history.",
    faqThreeQ: "Why not send every generated file to WeChat?",
    faqThreeA:
      "WeChat is better for concise results. HTML prefers screenshots, Office/PDF sends previewable files, and multi-file projects send a summary, entry point, and manifest.",
  },
};

function setLanguage(lang) {
  const table = copy[lang] || copy.zh;
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    if (!key || !table[key]) return;
    node.innerHTML = table[key];
  });
  document.querySelectorAll(".lang-btn").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.lang === lang);
  });
  window.localStorage.setItem("deepseekcode-site-lang", lang);
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
  button.addEventListener("click", () => setLanguage(button.dataset.lang || "zh"));
});

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const target = document.querySelector(button.dataset.copy || "");
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target.innerText);
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

setLanguage(window.localStorage.getItem("deepseekcode-site-lang") || "zh");
