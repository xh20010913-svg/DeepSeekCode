const copy = {
  zh: {
    navInstall: "安装",
    navShots: "截图",
    navFeatures: "能力",
    navRemote: "远程",
    navStart: "开始使用",
    heroTitle: "面向 <em>DeepSeek</em> 的本地工程 Agent runtime。",
    heroLede:
      "DeepSeekCode 把 native tool calls、本地文件、shell/browser 权限、项目状态、长期记忆、skills、MCP、微信远程、多 Agent 和项目验收放进同一条可恢复的运行链路。",
    heroPrimary: "安装启动",
    heroSecondary: "阅读指南",
    installTitle: "全局安装，在当前工作区启动。",
    installText:
      "在任意项目目录运行 deepseekcode。会话、run、事件、记忆、远程绑定和产物记录保存在当前工作区的 .deepseekcode 中，便于继续任务和恢复上下文。",
    copy: "复制",
    shotsTitle: "运行截图。",
    shotsText: "桌面 TUI、个人微信远程和 GSAP skill 调用都通过同一个项目 runtime 工作。",
    shotDesktop: "本机 TUI：微信输入、进度和最终回复同步显示。",
    shotWechat: "个人微信：远程任务的简洁进度和完成摘要。",
    shotSkill: "Skill：GSAP 自动参与页面动画任务，并完成入口验证。",
    featuresTitle: "当前接通的核心能力。",
    featureAction:
      "模型通过 DeepSeek tools 数组请求本地工具；runtime 负责参数校验、权限、执行、tool_result 回放和失败反馈。",
    featureVerify: "verify_project / launch_project 会根据真实文件运行 build/test/start、浏览器截图和产物检查，失败后回放给模型修复。",
    featureWindows: "run_command 会在执行前识别常见 POSIX 命令和 node-gyp 等失败类型，给模型可执行的 Windows 修复建议。",
    featureSkills: "支持本地、GitHub、Git URL 和 file:// skill/plugin 安装。模型可通过 search_skills 与 invoke_skill 自动调用。",
    featureAgents: "主 agent 可以创建 Planner、Builder、Tester、Reviewer 等角色，使用共享黑板记录分工和验收结论。",
    featureArtifacts: "网页优先截图，Office/PDF 发可预览文件，多文件项目发摘要、入口和 manifest，不刷屏发送源码。",
    remoteTitle: "电脑执行任务，微信查看进度、审批权限和接收结果。",
    remoteText:
      "推荐在桌面 TUI 里通过 /remote-control 绑定个人微信或企业微信。远程消息进入同一个 QueryEngine、同一套权限 gate 和同一份项目状态。",
    statusTitle: "能力状态。",
    roadmapTitle: "下一步。",
    roadRemote: "改进 OpenClaw 网络恢复、浏览器扫码稳定性、TUI 与微信完整同步。",
    roadAgents: "补多 Agent 可视化面板、角色独立执行和更完整的 worker pool。",
    roadDelivery: "增强网页、文档、PDF 的图片预览质量，继续避免源码刷屏。",
    roadTesting: "扩展 MCP 真实服务测试、Office/PPT 渲染检查和长任务卡住诊断。",
  },
  en: {
    navInstall: "Install",
    navShots: "Screenshots",
    navFeatures: "Capabilities",
    navRemote: "Remote",
    navStart: "Start",
    heroTitle: "A local engineering agent runtime for <em>DeepSeek</em>.",
    heroLede:
      "DeepSeekCode connects native tool calls, local files, shell/browser permissions, project state, long-term memory, skills, MCP, WeChat remote control, multi-agent workflows, and project verification in one resumable runtime.",
    heroPrimary: "Install",
    heroSecondary: "Read Guide",
    installTitle: "Install globally. Start from the current workspace.",
    installText:
      "Run deepseekcode from any project directory. Sessions, runs, events, memory, remote bindings, and artifacts are stored in that workspace's .deepseekcode directory.",
    copy: "Copy",
    shotsTitle: "Runtime screenshots.",
    shotsText:
      "The desktop TUI, personal WeChat remote control, and GSAP skill invocation all run through the same project runtime.",
    shotDesktop: "Desktop TUI: WeChat input, progress, and final reply are mirrored.",
    shotWechat: "Personal WeChat: concise remote progress and completion summary.",
    shotSkill: "Skill: GSAP participates in a page animation task and validates the entry file.",
    featuresTitle: "Connected core capabilities.",
    featureAction:
      "The model requests local tools through DeepSeek tools. The runtime validates arguments, applies permissions, executes tools, replays tool results, and reports failures.",
    featureVerify: "verify_project and launch_project inspect real files, run build/test/start, capture browser screenshots, and feed failures back for repair.",
    featureWindows: "run_command detects common POSIX commands and node-gyp-style failures before or after execution, then returns Windows-ready repair guidance.",
    featureSkills: "Local, GitHub, Git URL, and file:// skill/plugin installation are supported. The model can use search_skills and invoke_skill.",
    featureAgents: "The main agent can create Planner, Builder, Tester, and Reviewer roles, using a shared blackboard for work and acceptance.",
    featureArtifacts: "HTML prefers screenshots, Office/PDF sends previewable files, and multi-file projects send summaries, entry files, and manifests.",
    remoteTitle: "Let the computer run the task; use WeChat for progress, approvals, and results.",
    remoteText:
      "Bind personal WeChat or WeCom from the desktop TUI with /remote-control. Remote messages share the same QueryEngine, permission gates, and project state.",
    statusTitle: "Capability status.",
    roadmapTitle: "Next steps.",
    roadRemote: "Improve OpenClaw network recovery, browser QR login stability, and full TUI/WeChat mirroring.",
    roadAgents: "Add a multi-agent visual panel, more independent role execution, and a fuller worker pool.",
    roadDelivery: "Improve preview quality for web, document, and PDF artifacts without flooding chat with source files.",
    roadTesting: "Expand real MCP service tests, Office/PPT render checks, and stuck long-task diagnostics.",
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
      button.innerText = document.documentElement.lang === "en" ? "Copied" : "已复制";
      window.setTimeout(() => {
        button.innerText = original;
      }, 1200);
    } catch {
      button.innerText = "Select";
    }
  });
});

setLanguage(window.localStorage.getItem("deepseekcode-site-lang") || "zh");
