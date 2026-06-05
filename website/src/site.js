const copy = {
  zh: {
    navInstall: "安装",
    navShots: "截图",
    navFeatures: "能力",
    navRemote: "远程",
    navStart: "开始使用",
    heroTitle: "面向 <em>DeepSeek</em> 的本地开发 Agent。",
    heroLede:
      "DeepSeekCode 在终端中连接 DeepSeek native tool calls、本地文件、shell/browser 权限、skills、MCP、长期记忆、微信远程和多 Agent 工作流，用一条可恢复的运行链路完成规划、执行、验证和交付。",
    heroPrimary: "安装启动",
    heroSecondary: "阅读指南",
    installTitle: "全局安装，在当前工作区启动。",
    installText:
      "从任意仓库或工作目录运行 deepseekcode。运行状态、会话、记忆、远程绑定和产物记录会保存在当前工作区的 .deepseekcode 中，便于继续任务和恢复上下文。",
    copy: "复制",
    shotsTitle: "运行示例。",
    shotsText: "桌面 TUI、个人微信远程控制和 GSAP skill 调用在同一套项目运行时中协同工作。",
    shotDesktop: "本机 TUI：微信输入、进度和最终回复同步显示。",
    shotWechat: "个人微信：远程任务的简洁进度和完成摘要。",
    shotSkill: "Skill：GSAP skill 自动参与页面动画任务，并完成入口验证。",
    featuresTitle: "核心能力。",
    featureAction:
      "模型通过 DeepSeek tools 数组请求本地工具；runtime 负责 Zod 校验、权限、执行、tool_result 回放和失败反馈。",
    featureState: "每个工作区独立保存 transcript、runs、events、artifacts、usage、approval gates 和长期记忆。",
    featureRemote: "企业微信和个人微信 OpenClaw 都保留。远程端只显示简洁进度、权限审批、旁路问答和产物预览。",
    featureSkills: "支持本地、GitHub、Git URL 和 file:// skill/plugin 安装。模型可通过 search_skills 与 invoke_skill 自动调用。",
    featureAgents: "主 agent 可以创建角色、共享黑板和 Reviewer 验收角色。该能力可测试，但仍标为实验中。",
    featureArtifacts: "网页优先截图，Office/PDF 发可预览文件，多文件项目发摘要、入口和 manifest，不刷屏发源码。",
    remoteTitle: "电脑继续运行，微信负责控制和看结果。",
    remoteText:
      "推荐在电脑 TUI 中通过 /remote-control 绑定个人微信或企业微信。远程消息进入同一个 QueryEngine、同一套权限 gate 和同一份项目状态，不另造孤立 agent。",
    archTitle: "桌面、远程和工具执行共用同一条运行链路。",
    statusTitle: "能力矩阵。",
    roadmapTitle: "下一步。",
    roadRemote: "微信二维码浏览器扫码稳定性、OpenClaw 网络错误恢复、TUI 与微信完整同屏同步。",
    roadAgents: "多 Agent 可视化面板、角色独立执行和更完整的 worker pool。",
    roadDelivery: "网页、文档、PDF 的高质量图片预览和不刷屏的产物回传策略。",
    roadTesting: "MCP 真实服务测试、Office/PPT 渲染检查、长任务卡住诊断。",
  },
  en: {
    navInstall: "Install",
    navShots: "Screenshots",
    navFeatures: "Capabilities",
    navRemote: "Remote",
    navStart: "Start",
    heroTitle: "A local development agent for <em>DeepSeek</em>.",
    heroLede:
      "DeepSeekCode connects DeepSeek native tool calls, local files, shell/browser permissions, skills, MCP, long-term memory, WeChat remote control, and multi-agent workflows in a resumable terminal runtime.",
    heroPrimary: "Install",
    heroSecondary: "Read Guide",
    installTitle: "Install globally. Start from the current workspace.",
    installText:
      "Run deepseekcode from any repository or working directory. Runtime state, sessions, memory, remote bindings, and artifact records are stored in that workspace's .deepseekcode directory.",
    copy: "Copy",
    shotsTitle: "Runtime examples.",
    shotsText:
      "The desktop TUI, personal WeChat remote control, and GSAP skill invocation all run through the same project runtime.",
    shotDesktop: "Desktop TUI: WeChat input, progress, and final reply are mirrored.",
    shotWechat: "Personal WeChat: concise remote progress and completion summary.",
    shotSkill: "Skill: GSAP participates in a page animation task and validates the entry file.",
    featuresTitle: "Core capabilities.",
    featureAction:
      "The model requests local tools through DeepSeek tools. The runtime validates with Zod, applies permissions, executes tools, replays tool results, and reports failures.",
    featureState: "Each workspace stores transcripts, runs, events, artifacts, usage, approval gates, and long-term memory.",
    featureRemote: "WeCom and personal WeChat OpenClaw are retained. Remote chat shows concise progress, approvals, side-channel answers, and previews.",
    featureSkills: "Local, GitHub, Git URL, and file:// skill/plugin installation are supported. The model can call search_skills and invoke_skill.",
    featureAgents: "The main agent can create roles, a shared blackboard, and a reviewer role. This remains experimental but testable.",
    featureArtifacts: "HTML prefers screenshots, Office/PDF sends previewable files, and multi-file projects send summaries, entry files, and manifests.",
    remoteTitle: "Keep the computer running; control and inspect results from WeChat.",
    remoteText:
      "Recommended flow: bind personal WeChat or WeCom from the desktop TUI with /remote-control. Remote messages share the same QueryEngine, permission gates, and project state.",
    archTitle: "One runtime chain across desktop, remote channels, and local tools.",
    statusTitle: "Capability matrix.",
    roadmapTitle: "Next steps.",
    roadRemote: "QR/browser login stability, OpenClaw network recovery, and full TUI/WeChat mirroring.",
    roadAgents: "Multi-agent visual dashboard, more independent role execution, and a fuller worker pool.",
    roadDelivery: "Higher-quality previews for web, document, and PDF artifacts without flooding chat.",
    roadTesting: "Real MCP service tests, Office/PPT render checks, and stuck long-task diagnostics.",
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
    const original = button.innerText;
    try {
      await navigator.clipboard.writeText(target.innerText);
      button.innerText = button.dataset.lang === "en" ? "Copied" : "已复制";
      window.setTimeout(() => {
        button.innerText = original;
      }, 1200);
    } catch {
      button.innerText = "Select";
    }
  });
});

setLanguage(window.localStorage.getItem("deepseekcode-site-lang") || "zh");
