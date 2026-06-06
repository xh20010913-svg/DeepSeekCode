<p align="center">
  <img src="assets/deepseekcode-logo.svg" alt="DeepSeekCode" width="640"/>
</p>

<p align="center">
  <strong>简体中文</strong>
  &nbsp;|&nbsp;
  <a href="./README.md">English</a>
  &nbsp;|&nbsp;
  <a href="https://xh20010913-svg.github.io/DeepSeekCode/">官网</a>
  &nbsp;|&nbsp;
  <a href="./GUIDE.md">使用指南</a>
  &nbsp;|&nbsp;
  <a href="./ARCHITECTURE.md">架构</a>
  &nbsp;|&nbsp;
  <a href="./CLI_REFERENCE.md">CLI</a>
  &nbsp;|&nbsp;
  <a href="./DEVELOPMENT.md">开发文档</a>
  &nbsp;|&nbsp;
  <a href="./API_REFERENCE.md">接口文档</a>
</p>

# DeepSeekCode

DeepSeekCode 是一个面向 DeepSeek native tool calling 的本地工程 Agent runtime。它把文件读写、shell/browser 权限、项目状态、长期记忆、skills/plugins、MCP、微信远程、多 Agent 工作流、项目启动验收和失败自修复放在同一条可恢复的 TypeScript 运行链路里。

当前版本：`v0.2.9`。本文档按真实接通状态标注能力，不把实验能力写成完成品。

```text
TUI / 微信 / CLI 输入
  -> QueryEngine
  -> 稳定 system prompt + 工具 schema + skills index + 项目状态
  -> DeepSeek native tool_calls
  -> 本地 typed tools
  -> tool_result 摘要回放
  -> 继续执行、修复、验收或最终回复
```

## 真实运行截图

| 本机 TUI 同步微信输入/输出 | 个人微信远程结果 |
| --- | --- |
| ![本机 TUI 同步微信输入输出](assets/screenshots/wechat-desktop-sync.png) | ![个人微信远程结果](assets/screenshots/wechat-mobile-result.png) |

GSAP skill 自动参与网页动画任务，并完成入口文件验证：

![GSAP skill 调用测试](assets/screenshots/gsap-skill-run.png)

## 快速开始

要求：

- Node.js 22 或更新版本。
- DeepSeek API key。
- 一个独立项目目录，例如 `D:\code\DeepSeekTest`。

全局安装后，在任意项目目录输入 `deepseekcode` 即可启动。默认项目目录是当前目录，运行数据写入当前目录的 `.deepseekcode`。

```cmd
npm install -g @xh12312/deepseekcode --registry https://registry.npmjs.org/
cd /d D:\code\DeepSeekTest
deepseekcode --model deepseek-v4-flash
```

主命令是 `deepseekcode`。包不安装 `deepseek` 别名，避免和其他 DeepSeek 工具冲突。

源码运行：

```cmd
git clone https://github.com/xh20010913-svg/DeepSeekCode.git
cd DeepSeekCode
npm install
npm run build
npm run start -- --project "D:\code\DeepSeekTest" --model deepseek-v4-flash
```

常用环境变量：

```env
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEKCODE_LANGUAGE=zh-CN
```

## TUI 与权限

DeepSeekCode 不用“网页、shell、PPT、代码”这类关键词硬判定任务。模型通过 native tool call 请求工具，runtime 在工具执行前统一做权限、安全和平台兼容性校验。

常用命令：

| 命令 | 用途 |
| --- | --- |
| `/doctor` | 检查 provider、native tool calling、路径、skills/plugins、缓存和权限。 |
| `/tools` | 显示真实接入的工具。 |
| `/model`、`/model flash`、`/model pro` | 选择模型。 |
| `/language zh\|en` | 切换界面语言，默认中文。 |
| `/shell on\|off` | 切换本会话 shell 能力。 |
| `/browser on\|off` | 切换浏览器/CDP 能力。 |
| `/status`、`/status full` | 查看简略/详细任务状态。 |
| `/cache report` | 查看缓存命中率、稳定前缀和低命中原因。 |
| `/usage`、`/cost` | 查看 token 和估算费用。 |
| `/ask <问题>` | 长任务运行中发起只读旁路问答。 |
| `/remote-control` | 绑定或管理微信/企微远程控制。 |
| `/skills`、`/plugins`、`/mcp` | 管理扩展能力。 |

shell 默认关闭。开启后，真正的命令执行仍会走 permission gate；TUI 用方向键选择，微信用数字审批，企业微信用卡片审批。

## Windows 命令兼容与自修复

v0.2.9 增加了 `run_command` Windows preflight。它不会替模型做任务判断，只在命令执行前识别明显不兼容的 shell 语法，并把可执行的 PowerShell 建议作为 tool_result 反馈给模型。

覆盖场景包括：

- `mkdir -p`、`cat`、`touch`、`rm -rf`、`cp -r`、`ls -la`。
- bash heredoc、`/dev/null`、不兼容的管道片段。
- `node-gyp`、Visual Studio 缺失、Node 版本不兼容、端口占用、依赖安装失败。

模型收到失败结果后应选择修命令、换纯 JS 方案、降低依赖复杂度、重试，或明确说明需要用户安装系统组件。

## 项目启动与验收

新增通用 `verify_project` / `launch_project` 工具，不写死网页任务。

runtime 根据真实文件判断验收方式：

| 项目/产物 | 验收方式 |
| --- | --- |
| `package.json` | 按项目脚本运行 install/build/test/start/dev，记录输出和失败原因。 |
| HTML | 用浏览器打开并截图，检查空白页、资源 404、控制台错误和缺失入口。 |
| 后端服务 | 启动服务，检查端口和 health。 |
| DOCX/PPTX/XLSX/PDF | 检查文件存在、大小和可预览能力。 |
| 多文件项目 | 生成入口、manifest、截图和启动说明。 |

如果验收失败，错误会作为 tool_result 回放给模型，模型应自动修复并再次验收。最终回复必须说明入口文件、启动命令、验收结果、已修复项或仍需用户处理的失败项。

## 微信远程控制

保留两条远程通道：

- 企业微信 WeCom：基于 `@wecom/aibot-node-sdk`。
- 个人微信 OpenClaw：基于 Tencent `@tencent-weixin/openclaw-weixin@2.4.4`，实验中。

推荐流程是在电脑项目目录启动 TUI，然后用 `/remote-control` 绑定微信。电脑继续运行，微信负责发任务、看简洁进度、审批权限、收结果。

```text
/remote-control
/remote-control wechat login
/remote-control wechat start
/remote-control wecom start
```

也可以纯远程启动：

```cmd
deepseekcode --wechat-login --project "D:\code\DeepSeekTest"
deepseekcode --wechat --project "D:\code\DeepSeekTest" --model deepseek-v4-flash
deepseekcode --wecom --project "D:\code\DeepSeekTest" --model deepseek-v4-flash
```

微信命令：

```text
/help
/status
/status full
/ask 现在做到哪了
/project
/project D:\code\DeepSeekTest
/run 继续完成这个项目并发预览
/continue
/stop
/artifacts
/usage
/shell on
/shell off
```

普通问候按聊天回复；任务请求进入本地 agent runtime。长任务运行中，`/ask` 是只读旁路问答，不写文件、不执行 shell、不污染主任务历史。

个人微信没有企业微信模板卡片，因此权限审批使用数字菜单：

```text
1 允许一次
2 本会话允许
3 拒绝
4 停止任务
```

## 远程产物回传

产物回传由 runtime 根据真实文件和 manifest 规划，不靠用户 prompt 关键词。

| 产物 | 微信回传策略 |
| --- | --- |
| `.html` / `.htm` | 优先生成浏览器截图发图片，再发入口摘要；不刷屏发送 HTML/CSS/JS。 |
| `.docx` / `.pptx` / `.xlsx` | 发送微信可打开的原文件；若本机有 LibreOffice，后续可补 PDF/首屏预览。 |
| `.pdf` | 发送 PDF；后续可补前 1-3 页图片预览。 |
| `.png` / `.jpg` / `.webp` | 直接发图片。 |
| `.md` / `.txt` | 默认发短摘要；用户要求时再发文件。 |
| 多文件项目 | 发完成摘要、入口、截图和 manifest，不逐个发源码。 |

如果 OpenClaw 发图失败，会降级为本地预览图路径和简短原因。

## Skills / Plugins / MCP

DeepSeekCode 支持 `.deepseekcode` skills，并兼容 `.claude` 风格 `SKILL.md`。安装目标写入 `.deepseekcode`。

```text
/skills install "D:\skills\office-report"
/skills install https://github.com/example/agent-skills/tree/main/office/report
/skills install file:///D:/repos/agent-skills.git#main:office/report
/skills install greensock/gsap-skills
/skills install-all greensock/gsap-skills
/skills search gsap
/skills validate
/skills run gsap-core "给当前网页加产品级动画"
```

自动调用规则：

- `search_skills` 和 `invoke_skill` 是 native tools。
- 模型根据任务语义搜索和调用 skill，不需要用户每次明确说“用 GSAP skill”。
- skill 的 `description` 越清楚，自动调用越可靠。
- `disable-model-invocation: true` 的 skill 不进自动候选，但可手动运行。

MCP 目前通过统一 `mcp_call` 入口接入；逐工具展开为 native schema 仍在推进。MCP 的权限、hooks、tool_result 摘要规则和本地工具一致。

## 多 Agent 与旁路问答

多 Agent workflow 是实验中但可测试的能力。主模型可以通过 native workflow tools 创建角色、共享黑板和 Reviewer 验收角色：

- `start_agent_workflow`
- `send_agent_message`
- `agent_status`
- `finish_agent_workflow`

用户可以直接说“开启多 agent 协作，让前端、后端、测试和验收一起做”。如果没有指定角色，主模型会按项目自动设计角色，并默认加入 Reviewer。

Reviewer 必须检查：

- 是否真的生成产物。
- 项目是否能启动。
- 页面是否空白、资源是否 404、控制台是否报错。
- build/test 是否通过。
- 是否覆盖用户原始需求。

`/ask <问题>` 是长任务运行时的只读旁路问答，只读取当前 run 状态、最近事件、产物和 usage。

## 缓存与 token

DeepSeekCode 的优化方向是稳定前缀和摘要压缩，而不是简单删除历史。

- system rules、tool schemas、skills index、项目规则固定顺序放在前缀，提高 DeepSeek context caching 复用。
- 最近对话保留高价值上下文。
- 旧历史进入 rolling summary。
- 长 stdout、diff、日志只回放关键摘要和 artifact manifest。
- `/cache report` 输出 stable prefix tokens、dynamic tokens、hit/miss、低命中原因和建议。

```text
/cache
/cache report
/usage
/cost
```

## 能力矩阵

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| DeepSeek native tool calls | 已验证 | 本地工具调用必须走 native tool calls；不支持的网关明确失败。 |
| 文件工具 | 已验证 | `read_file`、`write_file`、`append_file`、`apply_patch`、`list_files`、`grep_files`、`glob_files`。 |
| Shell 工具 | 权限控制 | 默认关闭；TUI/微信/企微审批后执行。 |
| Windows preflight | 已验证 | 在执行前识别常见 POSIX 命令和 node-gyp 等失败类型。 |
| 项目启动与验收 | 部分可用 | `verify_project` / `launch_project` 已接入；复杂项目继续增强。 |
| Browser/CDP | 部分可用 | 支持打开、截图、基础检测；完整 GUI 自动化仍在打磨。 |
| DOCX/PPTX/XLSX | 部分可用 | 可生成真实文件；版式和预览质量继续增强。 |
| PDF | 实验中 | PDF 生成/预览仍保守标注。 |
| TencentDB-Agent-Memory | 已验证 | 本地 SQLite 记忆和召回已接入；向量能力取决于额外配置。 |
| Skills/plugins | 已验证 | 支持安装、搜索、校验、调用和自动候选注入。 |
| MCP | 部分可用 | 统一 `mcp_call` 已接入；逐工具 schema 展开仍在推进。 |
| Hooks | 已验证 | PreToolUse/PostToolUse 围绕工具执行。 |
| 企业微信 WeCom | 实验中 / 可测试 | 文本任务、简洁进度、权限审批、产物摘要。 |
| 个人微信 OpenClaw | 实验中 / 可测试 | 扫码登录、长轮询、文本任务、数字审批、产物摘要。 |
| 多 Agent workflow | 实验中 / 可测试 | role specs、blackboard、Reviewer、checkpoint 已接入；可视化面板仍在推进。 |
| `/ask` 旁路问答 | 已验证 | 长任务中只读问答。 |
| 长任务 worker pool | 部分可用 | run/task/checkpoint/resume/cancel 已有；完整后台 worker pool 继续演进。 |
| `computer_use` | 保留 | 没有真实 GUI 桥接前不宣传完整支持。 |
| 个人微信 hook | 保留 | 不接入默认版。 |

## 真实测试建议

测试产物只放独立目录，例如 `D:\code\DeepSeekTest`。

推荐场景：

- 多 Agent 前后端商城：生成、安装、启动、浏览器验收、失败自修复。
- GSAP 动画网页：自动调用 skill，打开截图。
- DOCX / PPTX / XLSX / PDF：生成、预览、微信回传。
- MCP mock server：连接、调用、失败恢复。
- 微信远程：普通聊天、任务、`/ask`、`/status full`、产物预览。
- 长任务：多轮继续、`/cache report`、token/cost 对比。

基础检查：

```cmd
npm.cmd run typecheck
npm.cmd run build
npm.cmd pack --dry-run
```

## 仍需继续完善

- 微信二维码浏览器扫码稳定性和 OpenClaw 网络错误恢复。
- TUI 与微信完整同屏同步。
- 多 Agent 可视化面板或侧窗。
- 网页、文档、PDF 的高质量图片预览。
- MCP 真实服务场景覆盖。
- 长任务卡住诊断的细粒度 phase 与重试策略。
- Office/PPT 模板、图表、图片和渲染检查。

## License

MIT
