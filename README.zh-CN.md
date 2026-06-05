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

DeepSeekCode 是一个 DeepSeek 优先的本地终端 Agent runtime。它把 DeepSeek native tool calling、本地文件工具、shell/browser 权限 gate、项目状态、长期记忆、skills/plugins、MCP、微信远程控制、多 Agent 编排和可恢复长任务放在同一条 TypeScript 运行链路里。

当前公开版本是 `v0.2.8`。这版不宣称所有能力已经完全成熟，README 会按真实接通情况标注：`已验证`、`部分可用`、`实验中`、`保留`。

```text
用户输入 / 微信消息 / TUI 命令
  -> QueryEngine
  -> 稳定 runtime prompt + 动态上下文 + skill/tool schema
  -> DeepSeek native tool_calls
  -> 本地 typed tools
  -> tool_result messages
  -> 下一轮 provider 调用或最终回答
```

模型不再通过大块 ActionEnvelope JSON 来规划工具。内部仍然保留 Zod schema、JSON 配置和 SQLite 状态，用于参数校验、状态持久化和测试报告。

## 运行截图

下面三张图展示本机 TUI、个人微信远程控制和 GSAP skill 调用的实际运行状态。

| 本机 TUI 同步微信输入/输出 | 个人微信远程结果 |
| --- | --- |
| ![本机 TUI 同步微信输入输出](assets/screenshots/wechat-desktop-sync.png) | ![个人微信远程结果](assets/screenshots/wechat-mobile-result.png) |

GSAP skill 自动调用和产物验证：

![GSAP skill 调用测试](assets/screenshots/gsap-skill-run.png)

## 快速开始

要求：

- Node.js 22 或更新版本。
- DeepSeek API key。
- 一个独立的项目目录，例如 `D:\code\DeepSeekTest`。

全局安装后，在任意项目目录输入 `deepseekcode` 即可启动。默认项目目录是当前目录，运行数据写入当前目录的 `.deepseekcode`。

```cmd
npm install -g @xh12312/deepseekcode --registry https://registry.npmjs.org/
cd /d D:\code\DeepSeekTest
deepseekcode --model deepseek-v4-flash
```

安装后的主命令是 `deepseekcode`。包不安装 `deepseek` 别名，避免和其他 DeepSeek 生态工具冲突。

如果需要从源码运行：

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

## 模型和启动模式

TUI 内切换模型：

```text
/model
/model flash
/model pro
```

重启后继续：

```cmd
deepseekcode --project "D:\code\DeepSeekTest" --continue -p "继续上一个任务"
deepseekcode --project "D:\code\DeepSeekTest" --resume session_xxx -p "继续暂停的任务"
```

诊断当前安装和 provider：

```cmd
deepseekcode --doctor
```

## TUI 与权限

启动 TUI 时，如果 shell 还没开启，会先询问是否为本会话开启 shell 权限。方向键选择，Enter 确认，Esc/N 保持关闭。

权限不是关键词判断。模型需要执行命令时会通过 native tool call 请求 `run_command`，runtime 再统一进入权限 gate。TUI 显示工具名、命令、cwd、风险等级和允许/拒绝选项；微信端使用数字审批；企微端使用卡片审批。

常用命令：

| 命令 | 用途 |
| --- | --- |
| `/doctor` | 检查 provider、native tool calling、路径、skills/plugins、缓存和权限。 |
| `/tools` | 显示真实接入工具和状态。 |
| `/model` | 打开模型选择器。 |
| `/language zh\|en` | 切换 TUI 语言，默认中文。 |
| `/shell on\|off` | 切换本会话 shell 能力。 |
| `/browser on\|off` | 切换 browser/CDP 能力。 |
| `/cache` | 查看缓存准备度、prompt shape 和 guard 报告。 |
| `/usage` `/cost` | 查看 token 和估算费用。 |
| `/runs` `/trace` `/events` | 查看持久化 run、action、task、event。 |
| `/ask <问题>` | 长任务运行中进行只读旁路问答。 |
| `/remote-control` | 查看、启动或停止企业微信 / 个人微信远程控制。 |
| `/skills` `/plugins` `/mcp` | 管理扩展能力。 |

完整列表见 [CLI Reference](./CLI_REFERENCE.md)。

## 微信远程控制

DeepSeekCode 保留两条远程通道：

- 企业微信 WeCom：基于 `@wecom/aibot-node-sdk`。
- 个人微信 OpenClaw：基于 Tencent `@tencent-weixin/openclaw-weixin@2.4.4`。

推荐流程是先在电脑项目目录启动 TUI，再用 `/remote-control` 绑定微信。电脑继续运行，微信只负责发任务、看简洁进度、处理权限、收结果。

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

微信端命令：

```text
/help
/status
/status full
/ask 现在做到哪了
/project
/project D:\code\DeepSeekTest
/run 帮我继续完成这个网站并发预览
/continue
/stop
/artifacts
/usage
/shell on
/shell off
```

普通问候会按普通聊天回答；任务请求会进入本地 agent runtime。长任务运行中，`/ask` 是只读旁路问答，不写文件、不执行 shell、不污染主任务。

个人微信没有企业微信模板卡片，因此权限审批用数字菜单：

```text
1 允许一次
2 本会话允许
3 拒绝
4 停止任务
```

个人微信通道是实验中能力。它依赖 OpenClaw 的扫码登录和长轮询，二维码、网络、手机插件状态都可能影响稳定性；个人微信 PC hook、逆向协议和 wxauto 不属于默认版能力。

## 产物回传策略

远程产物回传由 runtime 根据真实文件和 manifest 判断，不靠“网页/PPT/文档”关键词写死。

| 产物 | 微信回传策略 |
| --- | --- |
| `.html` / `.htm` | 优先生成浏览器截图发图片，只发入口文件摘要，不刷屏发 HTML/CSS/JS。 |
| `.docx` / `.pptx` / `.xlsx` | 发送原文件；如果本机未来配置 LibreOffice，可补 PDF 或首屏图片预览。 |
| `.pdf` | 发送 PDF；未来可补前 1-3 页图片预览。 |
| `.png` / `.jpg` / `.webp` | 直接发图片。 |
| `.md` / `.txt` | 发短聊天摘要；用户要求时再发文件。 |
| 多文件项目 | 发完成摘要、入口文件、截图和 manifest，不逐个发送源码文件。 |

模型可以建议重要产物，但最终发什么由 `RemoteDeliveryPlan` 按文件类型、大小、项目边界和微信可读性决定。

## Skills、Plugins 和 MCP

DeepSeekCode 支持 `.deepseekcode` 和兼容 `.claude` 风格的 `SKILL.md`。安装目标写入 `.deepseekcode`，不直接污染上游 skill 仓库。

```text
/skills install "D:\skills\office-report"
/skills install https://github.com/example/agent-skills/tree/main/office/report
/skills install file:///D:/repos/agent-skills.git#main:office/report
/skills install greensock/gsap-skills
/skills install-all greensock/gsap-skills
/skills search gsap
/skills validate
/skills run gsap-core "给这个网页加产品级动画"
```

自动调用规则：

- `search_skills` 和 `invoke_skill` 是 native tools。
- 模型会根据任务语义自己检索和调用 skill，不需要用户每次说“使用某某 skill”。
- skill 的 `description` 越清楚，自动调用越可靠。
- 带 `disable-model-invocation: true` 的 skill 不进入自动候选，但可以手动运行。

Plugins 支持本地路径、GitHub URL、Git URL 和 `file://` Git 源安装。MCP 目前通过统一 `mcp_call` 入口接入，逐工具展开为 native schema 仍在推进。

## 多 Agent 和旁路问答

多 Agent workflow 是实验中但可测试的能力。主模型可以通过 native tools 启动角色工作流：

- `start_agent_workflow`
- `send_agent_message`
- `agent_status`
- `finish_agent_workflow`

用户可以直接说“开启多 agent 协作，让前端、测试、验收一起做”。如果用户没有指定角色，主模型会按项目生成角色，并默认加入 Reviewer/验收角色。runtime 使用 Supervisor + Shared Blackboard 记录角色消息和验收结论，避免不同项目串上下文。

`/ask <问题>` 是长任务运行时的只读旁路问答。它只读取当前 run、最近事件、任务、usage 和产物，不写文件、不执行 shell、不调用 browser/MCP 写操作。

## 长期记忆、上下文和缓存

DeepSeekCode 内置 [TencentDB-Agent-Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory) 的 MIT runtime：

- provider 调用前召回长期记忆。
- 成功回合后捕获对话并提取 L1/L2/L3。
- 本地 SQLite 是默认 store。
- TCVDB/embedding 是可选增强，不配置时不会宣传为完整向量记忆。

上下文分层：

- 稳定 runtime prompt 和工具定义放前面，提高 DeepSeek prefix cache 复用。
- 最近对话保留高价值上下文。
- rolling summary 保存旧目标、约束、路径、失败点和剩余工作。
- tool result micro-summary 避免长 stdout、diff、log 反复进 prompt。
- runtime run state 保存任务、artifact、gate、checkpoint 和 usage。

常用命令：

```text
/memory status
/memory search 语言偏好
/memory conversation "继续仪表盘"
/cache
/usage
/cost
```

## 能力矩阵

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| DeepSeek native tool calls | 已验证 | 本地工作必须走 native tool calls；不支持的模型/网关会明确失败。 |
| 文件工具 | 已验证 | `read_file`、`write_file`、`append_file`、`apply_patch`、`list_files`、`grep_files`、`glob_files`。 |
| Shell 工具 | 需权限 | 默认关闭；由 TUI/微信/企微权限 gate 批准。 |
| Browser CDP | 部分可用 | 已接入浏览器操作和截图；真实 UI 验收仍继续打磨。 |
| DOCX/PPTX | 部分可用 | 可生成真实文件；版式、图表和视觉验收继续增强。 |
| PDF | 实验中 | `create_pdf` 仍保留为实验能力。 |
| TencentDB-Agent-Memory | 已验证 | 本地 SQLite 记忆和召回已接入；向量能力取决于额外配置。 |
| Skills/plugins | 已验证 | 支持安装、搜索、校验、调用和自动候选注入。 |
| MCP | 部分可用 | 统一 `mcp_call` 入口已接入；逐工具 schema 展开仍在推进。 |
| Hooks | 已验证 | PreToolUse/PostToolUse 围绕工具执行。 |
| 企业微信 WeCom | 实验中 / 可测试 | 文本任务、简洁进度、权限审批、产物摘要。 |
| 个人微信 OpenClaw | 实验中 / 可测试 | 扫码登录、长轮询、文本任务、数字审批、产物摘要。 |
| 多 Agent workflow | 实验中 / 可测试 | role specs、blackboard、Reviewer、checkpoint 已接入；可视化面板仍在推进。 |
| `/ask` 旁路问答 | 已验证 | 长任务中只读问答。 |
| 长任务后台 worker | 部分可用 | run/task/checkpoint/resume/cancel 已有，完整 worker pool 继续演进。 |
| `computer_use` | 保留 | 没有真实 GUI 桥接前不宣传完整支持。 |
| 个人微信 hook | 保留 | 不接入默认版。 |

## 真实测试建议

测试产物只放独立目录，例如 `D:\code\DeepSeekTest`。

固定真实任务：

- 大型网页项目，多轮“继续完善”。
- 答辩 PPT、课程 PPT、OFDR 原理 PPT。
- DOCX 项目报告。
- 失败后让 agent 自修复。
- Planner/Builder/Tester/Reviewer 多 Agent 小项目。
- 微信远程发任务、查看进度、审批 shell、收产物摘要。
- GSAP skill 安装、搜索、自动调用、产物验证。
- MCP mock stdio/http 调用和权限失败恢复。

基础检查：

```cmd
npm.cmd run typecheck
npm.cmd run build
npm.cmd pack --dry-run
```

报告导出：

```text
/runs report latest "D:\code\DeepSeekTest"
```

## 仍需继续完善

v0.2.8 是发布质量收尾，不是“全部功能最终完成”。后续仍需继续推进：

- 微信二维码浏览器扫码和 OpenClaw 网络错误恢复。
- 微信消息与 TUI 更完整的同屏同步。
- 多 Agent 可视化工作台或侧窗。
- 网页/文档/PDF 的更高质量预览图回传。
- MCP 真实服务场景测试。
- 长任务状态诊断：更清楚显示模型等待、工具等待、卡住原因和下一步。
- Office/PPT 模板、图表、图片和渲染检查。

## 架构、开发和发布

- [Architecture](./ARCHITECTURE.md)
- [Development Guide](./DEVELOPMENT.md)
- [API Reference](./API_REFERENCE.md)
- [CLI Reference](./CLI_REFERENCE.md)
- [Guide](./GUIDE.md)

发布树只包含运行源码、公开资源、官网、README 和用户说明书。测试目录、prompt audit、运行数据库、登录态、生成报告和临时打包产物不属于 GitHub 发布内容。

## License

MIT
