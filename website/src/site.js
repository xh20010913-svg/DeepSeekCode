const copy = {
  zh: {
    navInstall: "安装",
    navLoop: "执行闭环",
    navShots: "真实截图",
    navCapabilities: "能力",
    navRemote: "远程",
    navStart: "开始使用",
    heroTitle: "DeepSeek 本地通用 Agent runtime.",
    heroLede:
      "DeepSeekCode 用 native tool calls 连接本地文件、shell/browser、权限审批、任务契约、通用验收、skills、MCP、微信远程和多 Agent 协作。它面向真实项目执行，而不只是生成建议文本。",
    heroPrimary: "安装启动",
    heroSecondary: "阅读 Guide",
    installTitle: "全局安装，在当前工作区启动。",
    installText:
      "进入任意项目目录运行 deepseekcode。会话、runs、events、artifacts、approvals、memory 和远程绑定会保存在该目录的 .deepseekcode 中，便于继续任务和恢复上下文。",
    copy: "复制",
    loopTitle: "从目标理解到真实验收。",
    loopText:
      "模型负责理解目标和选择工具；runtime 负责权限、安全、平台诊断、产物识别、通用验收和失败回放。网页只是其中一种验证器，同一套 verify_task 也覆盖代码、脚本、Office/PDF、数据、报告、插件、MCP 和自动化任务。",
    shotsTitle: "真实运行截图。",
    shotsText:
      "这些截图来自本机测试：TUI 同步微信消息、个人微信远程任务结果、GSAP skill 自动参与网页动画任务。",
    shotDesktop: "本机 TUI：微信输入、进度和最终回复同步显示。",
    shotWechat: "个人微信：远程任务的简洁进度和完成摘要。",
    shotSkill: "Skill：GSAP 自动参与页面动画任务，并完成入口验证。",
    featuresTitle: "当前版本的核心能力。",
    featureAction:
      "模型通过 DeepSeek tools 数组请求本地工具，runtime 负责 Zod 校验、权限、执行、tool_result 回放和失败反馈。",
    featureVerify:
      "verify_task 根据任务契约和真实产物选择验证器，覆盖代码、脚本、文档、数据、媒体、插件、MCP 和自动化输出。",
    featureWindows:
      "run_command 会识别常见 PowerShell 不兼容命令和 node-gyp/native dependency 失败，并给模型可执行的修复方向。",
    featureSkills:
      "支持本地、GitHub、Git URL 和 file:// skill/plugin 安装。模型可通过 search_skills 与 invoke_skill 自动调用。",
    featureAgents:
      "多 Agent workflow 先生成可确认计划；Planner 和 AcceptanceReviewer 固定，中间执行角色按任务动态生成，并用 Pixel cockpit 展示任务、阻塞和证据。",
    featureArtifacts:
      "远程回传按真实文件类型决定：图片预览、Office/PDF 文件、摘要、入口、manifest 和启动命令，不刷屏发送源码。",
    remoteTitle: "电脑执行任务，微信查看进度、审批权限、接收结果。",
    remoteText:
      "推荐在桌面 TUI 里通过 /remote-control 绑定个人微信或企业微信。远程消息进入同一个 QueryEngine、同一套权限 gate 和同一份项目状态。",
    statusTitle: "能力状态。",
    roadmapTitle: "下一步。",
    roadVerifyTitle: "通用验收",
    roadVerify: "继续扩大代码、Office、数据、MCP、自动化任务的真实验证覆盖。",
    roadAgentsTitle: "多 Agent",
    roadAgents: "继续扩大多 Agent 真实任务矩阵，打磨角色 checkpoint、通信轨迹和 Reviewer 证据链。",
    roadRemoteTitle: "远程控制",
    roadRemote: "改进 OpenClaw 网络恢复、浏览器扫码稳定性和 TUI/微信同步细节。",
    roadCacheTitle: "缓存成本",
    roadCache: "继续优化 stable prompt prefix、tool_result 摘要和 /cache report。",
  },
  en: {
    navInstall: "Install",
    navLoop: "Loop",
    navShots: "Screenshots",
    navCapabilities: "Capabilities",
    navRemote: "Remote",
    navStart: "Start",
    heroTitle: "A local agent runtime for DeepSeek.",
    heroLede:
      "DeepSeekCode connects native tool calls, local files, shell/browser execution, permission gates, task contracts, generic verification, skills, MCP, WeChat remote control, and multi-agent workflows. It is designed to execute real project work, not just produce advice.",
    heroPrimary: "Install",
    heroSecondary: "Read Guide",
    installTitle: "Install globally. Start in the current workspace.",
    installText:
      "Run deepseekcode from any project directory. Sessions, runs, events, artifacts, approvals, memory, and remote bindings are stored in that workspace's .deepseekcode directory so tasks can be resumed with project-local context.",
    copy: "Copy",
    loopTitle: "From intent to verified output.",
    loopText:
      "The model understands the goal and chooses tools. The runtime owns permissions, safety, platform diagnostics, artifact typing, generic verification, and failure replay. Web pages are only one validator; the same verify_task loop also covers code, scripts, Office/PDF, data, reports, plugins, MCP, and automation tasks.",
    shotsTitle: "Real runtime screenshots.",
    shotsText:
      "These screenshots come from local tests: TUI and WeChat synchronization, personal WeChat remote results, and GSAP skill usage in an animation task.",
    shotDesktop: "Desktop TUI: WeChat input, progress, and final reply are mirrored.",
    shotWechat: "Personal WeChat: concise remote progress and completion summary.",
    shotSkill: "Skill: GSAP participates in an animation task and validates the entry file.",
    featuresTitle: "Core capabilities.",
    featureAction:
      "The model calls local tools through DeepSeek's tools array; the runtime handles Zod validation, permissions, execution, tool_result replay, and failure feedback.",
    featureVerify:
      "verify_task selects validators from the task contract and real artifacts, covering code, scripts, documents, data, media, plugins, MCP, and automation outputs.",
    featureWindows:
      "run_command detects common PowerShell-incompatible commands and node-gyp/native dependency failures, then returns actionable repair guidance.",
    featureSkills:
      "Install skills/plugins from local paths, GitHub, Git URLs, and file:// sources. The model can discover and invoke them with search_skills and invoke_skill.",
    featureAgents:
      "Multi-agent workflows start with an approval plan; only Planner and AcceptanceReviewer are fixed, while task-specific roles are generated and shown in the Pixel cockpit.",
    featureArtifacts:
      "Remote delivery follows real artifact types: image previews, Office/PDF files, summaries, entry points, manifests, and launch commands without flooding source files.",
    remoteTitle: "Run on the desktop. Review progress and results from WeChat.",
    remoteText:
      "Bind personal WeChat or WeCom from the desktop TUI with /remote-control. Remote messages enter the same QueryEngine, the same permission gates, and the same project state.",
    statusTitle: "Capability status.",
    roadmapTitle: "Next.",
    roadVerifyTitle: "Verification",
    roadVerify: "Broaden real validation coverage for code, Office, data, MCP, and automation tasks.",
    roadAgentsTitle: "Multi-agent",
    roadAgents: "Expand real multi-agent scenario coverage and refine checkpoints, communication traces, and Reviewer evidence.",
    roadRemoteTitle: "Remote",
    roadRemote: "Improve OpenClaw recovery, browser-based login stability, and TUI/WeChat synchronization.",
    roadCacheTitle: "Cache cost",
    roadCache: "Continue improving stable prompt prefixes, tool_result summaries, and /cache report.",
  },
};

function applyLanguage(lang) {
  const dictionary = copy[lang] ?? copy.zh;
  document.documentElement.lang = lang === "en" ? "en" : "zh-CN";

  for (const node of document.querySelectorAll("[data-i18n]")) {
    const key = node.getAttribute("data-i18n");
    if (key && dictionary[key]) {
      node.textContent = dictionary[key];
    }
  }

  for (const button of document.querySelectorAll(".lang-btn")) {
    button.classList.toggle("is-active", button.dataset.lang === lang);
  }

  localStorage.setItem("deepseekcode-site-language", lang);
}

for (const button of document.querySelectorAll(".lang-btn")) {
  button.addEventListener("click", () => {
    applyLanguage(button.dataset.lang === "en" ? "en" : "zh");
  });
}

for (const button of document.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    const target = document.querySelector(button.dataset.copy);
    if (!target) return;
    const text = target.textContent ?? "";
    await navigator.clipboard.writeText(text.trim());
    const old = button.textContent;
    button.textContent = "OK";
    setTimeout(() => {
      button.textContent = old;
    }, 1200);
  });
}

const preferred = localStorage.getItem("deepseekcode-site-language") || "zh";
applyLanguage(preferred === "en" ? "en" : "zh");
