const copy = {
  zh: {
    navInstall: "安装",
    navLoop: "闭环",
    navShots: "截图",
    navCapabilities: "能力",
    navRemote: "远程",
    navStart: "开始使用",
    heroTitle: "DeepSeek 驱动的本地通用 Agent runtime。",
    heroLede:
      "DeepSeekCode 把 native tool calls、本地文件、shell/browser 权限、任务契约、通用验收、skills、MCP、微信远程和多 Agent 工作流放进同一条可恢复执行链路。",
    heroPrimary: "安装启动",
    heroSecondary: "阅读 Guide",
    installTitle: "全局安装，在当前工作目录启动。",
    installText:
      "进入任意项目目录运行 deepseekcode。会话、runs、events、artifacts、approvals、memory 和远程绑定保存在该项目的 .deepseekcode 目录中，便于继续任务和恢复上下文。",
    copy: "复制",
    loopTitle: "从任务契约到真实验收。",
    loopText:
      "模型负责理解目标和选择工具，runtime 负责权限、平台诊断、产物识别、通用验收和错误回放。网页只是 validator 之一；同一套 verify_task 也检查代码、脚本、Office/PDF、数据、报告、插件、MCP 和自动化任务。",
    shotsTitle: "真实运行截图。",
    shotsText:
      "三张截图展示本机 TUI 同步微信消息、个人微信远程结果、GSAP skill 自动调用和产物验证。",
    shotDesktop: "本机 TUI：微信输入、进度和最终回复同步显示。",
    shotWechat: "个人微信：远程任务的简洁进度和完成摘要。",
    shotSkill: "Skill：GSAP 自动参与页面动画任务，并完成入口验证。",
    featuresTitle: "当前版本的核心能力。",
    featureAction:
      "模型通过 DeepSeek tools 数组请求本地工具；runtime 负责 Zod 校验、权限、执行、tool_result 回放和失败反馈。",
    featureVerify:
      "verify_task 根据任务契约和真实产物选择验证器，覆盖代码、脚本、文档、数据、媒体、插件、MCP 和自动化输出。",
    featureWindows:
      "run_command 会识别常见 PowerShell 不兼容命令和 node-gyp/native dependency 失败，并给模型可执行的修复方向。",
    featureSkills:
      "支持本地、GitHub、Git URL 和 file:// skill/plugin 安装。模型可通过 search_skills 与 invoke_skill 自动调用。",
    featureAgents:
      "主 agent 可以创建 Planner、Builder、Tester、Reviewer 等角色，用共享黑板记录分工、阻塞和验收结论。",
    featureArtifacts:
      "远程回传按真实文件类型决定：图片预览、Office/PDF 文件、摘要、入口、manifest 和启动命令，不刷屏发源码。",
    remoteTitle: "电脑执行任务，微信查看进度、审批权限、接收结果。",
    remoteText:
      "推荐在桌面 TUI 里通过 /remote-control 绑定个人微信或企业微信。远程消息进入同一个 QueryEngine、同一套权限 gate 和同一份项目状态。",
    statusTitle: "能力状态。",
    roadmapTitle: "下一步。",
    roadVerifyTitle: "通用验收",
    roadVerify: "继续扩大代码、Office、数据、MCP、自动化任务的真实验证覆盖。",
    roadAgentsTitle: "多 Agent",
    roadAgents: "补更清晰的角色状态面板、独立子上下文和 Reviewer 证据链。",
    roadRemoteTitle: "远程控制",
    roadRemote: "改进 OpenClaw 网络恢复、浏览器扫码稳定性和 TUI/微信同步细节。",
    roadCacheTitle: "缓存成本",
    roadCache: "继续优化 stable prompt prefix、tool_result 摘要和 /cache report。",
  },
  en: {
    navInstall: "Install",
    navLoop: "Loop",
    navShots: "Shots",
    navCapabilities: "Capabilities",
    navRemote: "Remote",
    navStart: "Start",
    heroTitle: "A DeepSeek-native local agent runtime.",
    heroLede:
      "DeepSeekCode connects native tool calls, local files, shell/browser permissions, task contracts, generic verification, skills, MCP, WeChat remote control, and multi-agent workflows in one resumable runtime.",
    heroPrimary: "Install",
    heroSecondary: "Read Guide",
    installTitle: "Install globally. Start in the current workspace.",
    installText:
      "Run deepseekcode from any project directory. Sessions, runs, events, artifacts, approvals, memory, and remote bindings are stored in that workspace's .deepseekcode directory.",
    copy: "Copy",
    loopTitle: "From task contract to verified output.",
    loopText:
      "The model understands the goal and chooses tools. The runtime owns permissions, platform diagnostics, artifact typing, generic verification, and failure replay. Web pages are one validator. The same verify_task loop also covers code, scripts, Office/PDF, data, reports, plugins, MCP, and automation tasks.",
    shotsTitle: "Real runtime screenshots.",
    shotsText:
      "These screenshots show desktop TUI and WeChat synchronization, personal WeChat remote results, and GSAP skill invocation with artifact validation.",
    shotDesktop: "Desktop TUI: WeChat input, progress, and final reply are mirrored.",
    shotWechat: "Personal WeChat: concise progress and completion summary.",
    shotSkill: "Skill: GSAP participates in an animation task and validates the entry file.",
    featuresTitle: "Core capabilities.",
    featureAction:
      "The model requests local tools through DeepSeek tools. The runtime validates arguments, applies permissions, executes tools, replays tool results, and reports failures.",
    featureVerify:
      "verify_task chooses validators from the task contract and real artifacts across code, scripts, documents, data, media, plugins, MCP, and automation outputs.",
    featureWindows:
      "run_command detects common PowerShell-incompatible commands and node-gyp/native dependency failures, then returns repair guidance.",
    featureSkills:
      "Local, GitHub, Git URL, and file:// skill/plugin installation are supported. The model can use search_skills and invoke_skill.",
    featureAgents:
      "The main agent can create Planner, Builder, Tester, and Reviewer roles, with shared blackboard state for work, blockers, and acceptance.",
    featureArtifacts:
      "Remote delivery uses real file types: image previews, Office/PDF files, summaries, entry points, manifests, and startup commands instead of source-code floods.",
    remoteTitle: "Let the computer execute; use WeChat for progress, approvals, and results.",
    remoteText:
      "Bind personal WeChat or WeCom from the desktop TUI with /remote-control. Remote messages share the same QueryEngine, permission gates, and project state.",
    statusTitle: "Capability status.",
    roadmapTitle: "Next steps.",
    roadVerifyTitle: "Generic verification",
    roadVerify: "Expand real validation coverage for code, Office, data, MCP, and automation tasks.",
    roadAgentsTitle: "Multi-agent",
    roadAgents: "Improve role status panels, independent sub-contexts, and Reviewer evidence.",
    roadRemoteTitle: "Remote control",
    roadRemote: "Improve OpenClaw recovery, browser QR login stability, and TUI/WeChat synchronization.",
    roadCacheTitle: "Cache and cost",
    roadCache: "Keep improving stable prompt prefixes, tool_result summaries, and /cache report.",
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
