<p align="center">
  <img src="assets/deepseekcode-logo.svg" alt="DeepSeekCode" width="640"/>
</p>

<p align="center">
  <a href="./README.md">English</a>
  &nbsp;|&nbsp;
  <strong>简体中文</strong>
  &nbsp;|&nbsp;
  <a href="https://xh20010913-svg.github.io/DeepSeekCode/">官网</a>
  &nbsp;|&nbsp;
  <a href="./GUIDE.md">使用指南</a>
  &nbsp;|&nbsp;
  <a href="./ARCHITECTURE.md">架构</a>
  &nbsp;|&nbsp;
  <a href="./CLI_REFERENCE.md">CLI</a>
</p>

# DeepSeekCode

DeepSeekCode 是一个 DeepSeek 优先的本地终端 Agent 运行时，用于本地项目开发、办公文档生成、长任务协作和可恢复测试。它通过 DeepSeek native function calling 调用本地 typed tools，把 run、task、action、artifact、usage 写入 SQLite，并支持 CLI 重启后的继续执行。

v0.2.4 公开说明以真实接入能力为准。当前主链路如下：

```text
稳定 runtime prompt + 上下文
  -> DeepSeek native tool_calls
  -> 本地 typed tools
  -> tool_result messages
  -> 下一轮 provider 调用或最终回答
```

模型不再通过大块 ActionEnvelope JSON 来规划工具，也没有 JSON fallback。内部仍然保留 Zod/schema/JSON，用于工具参数校验、配置、状态和测试报告。

## 运行截图

下面三张图来自 `D:\code\DeepSeekTest` 的真实测试窗口：启动界面、agent 真实对话干活过程、以及生成网页产物在浏览器中的运行画面。截图不包含密钥、prompt audit 或测试产物原文。

| Agent 启动界面 | Agent 真实对话干活 |
| --- | --- |
| ![Agent 启动界面](assets/screenshots/agent-start.png) | ![Agent 真实对话干活](assets/screenshots/agent-working.png) |

产物运行截图：

![生成网页产物运行截图](assets/screenshots/artifact-running.png)

## 快速开始

要求：

- Node.js 22 或更新版本。
- 支持 native tool calls 的 DeepSeek chat/completions 端点。
- 一个给 DeepSeekCode 检查和修改的项目目录。

全局安装后，在任意项目目录输入 `deepseekcode` 即可启动。默认项目目录是当前目录，运行数据写入当前目录的 `.deepseekcode`。

官方 npm registry 安装：

```bash
npm install -g @xh12312/deepseekcode
cd D:\work\agent-test
deepseekcode
```

也可以用 GitHub 网络安装测试当前 `main` 分支：

```bash
npm install -g github:xh20010913-svg/DeepSeekCode
```

也可以显式指定目录：

```bash
deepseekcode --project "D:\work\agent-test"
```

安装后的命令是 `deepseekcode`。包不安装 `deepseek` 别名，避免和其他 DeepSeek 生态工具冲突。

Windows PowerShell 如果因为执行策略拦截 npm 生成的 `deepseekcode.ps1`，可以运行同目录的 `deepseekcode.cmd`；cmd 里直接输入 `deepseekcode`。

启动 TUI 时，如果 shell 还没开启，会先询问是否为本会话开启 shell 权限。方向键选择，Enter 确认，Esc/N 保持关闭。选择开启后，构建、测试、验证命令可直接在当前项目目录执行；选择保持关闭后，模型真正请求 `run_command` 时仍会弹出权限选择。

源码开发安装：

```bash
git clone https://github.com/xh20010913-svg/DeepSeekCode.git
cd DeepSeekCode
npm install
npm run build
```

配置：

```bash
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEKCODE_LANGUAGE=zh-CN
```

源码模式下在独立测试目录启动：

```bash
npm run start -- --project "D:\work\agent-test"
```

源码模式：

```bash
npm run dev -- --project "D:\work\agent-test"
```

重启 CLI 后继续：

```bash
deepseekcode --project "D:\work\agent-test" --continue -p "继续上一个任务"
deepseekcode --project "D:\work\agent-test" --resume session_xxx -p "继续暂停的任务"
```

## 模型切换

日常测试建议 flash，困难规划任务可切 pro：

```text
/model
/model flash
/model pro
```

`/model` 会打开 TUI 选择器；footer 会显示当前模型、token、cache hit/miss 和估算费用。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `/doctor` | 检查 provider、native tool calling、路径、skills/plugins、缓存和权限。 |
| `/tools` | 显示真实接入的工具，并标注已验证、需权限、部分可用、实验中、保留。 |
| `/skills` | 列出、搜索、安装、更新、校验、卸载、运行 skill。 |
| `/plugins` | 列出、安装、更新、校验、启用/禁用、卸载 plugin。 |
| `/model` | 打开模型选择器，或用 `/model flash`、`/model pro` 切换。 |
| `/language zh\|en` | 切换 TUI 语言，默认中文。 |
| `/cache` | 查看缓存准备度、prompt shape、profile 和 guard 报告。 |
| `/usage` `/cost` | 查看 token 和估算费用。 |
| `/memory status` | 查看 TencentDB-Agent-Memory 状态、存储、召回、提取和已注册记忆工具。 |
| `/memory search <query>` | 搜索结构化长期记忆。 |
| `/memory conversation <query>` | 搜索原始对话历史。 |
| `/runs` `/trace` `/events` | 查看持久化 run、action、task、event。 |
| `/runs report latest "D:\work\agent-test"` | 导出真实场景 Markdown/JSON 报告。 |
| `/multi provider <任务>` | 运行 Planner -> Builder -> Tester -> Reviewer 多 Agent 流程。 |
| `/approval` `/validation` | 查看和处理权限/验证 gate。 |
| `/resume` `/sessions` | 恢复持久化会话。 |

完整命令见 [CLI Reference](./CLI_REFERENCE.md)。

## 能力矩阵

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| DeepSeek native tool calls | 已验证 | 本地工具必须走 native tool calls；不支持的模型/网关会明确失败。 |
| TencentDB-Agent-Memory | 已验证 | 内置腾讯 TencentDB-Agent-Memory MIT runtime，支持 L0 对话捕获、L1 结构化记忆、L2 场景、L3 用户画像、召回注入，以及 `tdai_memory_search`/`tdai_conversation_search`。默认本地 SQLite；TCVDB 和 embedding 需要显式配置。 |
| 文件工具 | 已验证 | `read_file`、`write_file`、`apply_patch`、`list_files`、`grep_files`，受 `--project` 边界限制。 |
| Shell 工具 | 需权限 | 默认关闭；Windows 危险命令进入权限 gate。 |
| Browser CDP 工具 | 部分可用 | 浏览器动作已接入并受权限控制；真实 UI 验收仍需要继续打磨。 |
| MCP | 部分可用 | 通过 `mcp_call` 统一入口接入；逐工具 native schema 展开仍在推进。 |
| Hooks | 已验证 | PreToolUse/PostToolUse 围绕本地工具执行；hook 错误记录到事件，不污染主任务。 |
| Skills | 已验证 | 内置、项目、用户、插件 skill 可发现和调用；兼容 `.claude`，安装目标为 `.deepseekcode`。 |
| Plugins | 已验证 | 支持本地路径、GitHub URL、Git URL、`file://` Git 安装。 |
| DOCX/PPTX | 部分可用 | `create_docx`/`create_pptx` 已接入；更高质量的 Office/PPT 版式、图表和视觉检查仍在继续增强。 |
| PDF | 实验中 | `create_pdf` 仍是 reserved/experimental，不能当完整 PDF 能力宣传。 |
| 长任务后台 | 部分可用 | run/task/checkpoint/pause/resume/cancel/multi-agent 已持久化，完整后台 worker pool 继续演进。 |
| `computer_use` | 保留 | 没有真实 GUI 桥接前保持 reserved。 |
| Prompt audit | 调试模式 | 默认关闭，设置 `DEEPSEEKCODE_PROMPT_AUDIT_DIR` 才记录 provider 请求。 |

## Skills 和 Plugins

安装 skill：

```text
/skills install "D:\skills\office-report"
/skills install https://github.com/example/agent-skills/tree/main/office/report
/skills install file:///D:/repos/agent-skills.git#main:office/report
/skills update office-report
/skills validate
```

安装 plugin：

```text
/plugins install "D:\plugins\review-kit"
/plugins install https://github.com/example/deepseekcode-plugin
/plugins install file:///D:/repos/deepseekcode-plugin.git#main
/plugins enable review-kit
/plugins validate
```

安装时会校验名称、manifest、BOM、路径穿越和 Git subpath。`.claude` skill/plugin 可以被发现用于兼容，但安装副本写入 `.deepseekcode`。

## 长任务、上下文和缓存

DeepSeekCode 不会把所有历史原文无限塞回 prompt。上下文分层如下：

- 稳定 runtime prompt 和工具定义放在最前面，提高 prefix cache 命中。
- TencentDB-Agent-Memory 在分类和规划前召回 L1/L3 长期记忆。
- 最近对话保留最后几轮高价值上下文。
- rolling summary 保留旧目标、约束、路径、失败点和剩余工作。
- `tool_result_summary` 只保存关键工具反馈，不反复塞长 stdout、diff、log。
- `runtime_run_state` 总结 run、task DAG、artifact、gate 和 checkpoint。

用 `/cache`、`/usage`、`/cost`、`/runs`、`/trace` 查看长任务状态和成本。

## 长期记忆

DeepSeekCode 内置 [TencentDB-Agent-Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory) 的 MIT runtime。它不是以 OpenClaw 插件形式安装，而是接入 DeepSeekCode 自己的运行链路：

- 每次 provider 调用前执行 TDAI recall，把相关长期记忆注入动态上下文。
- 成功回合结束后，把用户/助手消息捕获到 TDAI L0，并由 TDAI pipeline 提取 L1/L2/L3。
- 主模型可以通过 native tool calling 调用 `tdai_memory_search` 和 `tdai_conversation_search`。
- 数据写在运行数据目录，例如 `.deepseekcode/tdai/memory-tdai/`。
- embedding 和腾讯云 VectorDB 是可选配置；未配置 embedding 时仍支持本地 SQLite/FTS 和 JSONL 捕获，但不会宣传成完整语义向量召回。

常用命令：

```text
/memory status
/memory search 语言偏好
/memory conversation "继续仪表盘"
```

配置开关：

```bash
DEEPSEEKCODE_TDAI_MEMORY=on
DEEPSEEKCODE_TDAI_CAPTURE=true
DEEPSEEKCODE_TDAI_RECALL=true
DEEPSEEKCODE_TDAI_EXTRACTION=true
DEEPSEEKCODE_TDAI_STORE=sqlite
```

## 真实场景测试

真实测试建议全部在 `D:\work\agent-test` 这类独立目录中跑。

固定场景：

- 大型单页网站，并多轮“继续完善”。
- 答辩 PPT、课程 PPT、OFDR 原理 PPT，要求图文、结构和验证。
- DOCX 项目报告。
- 制造失败后让 agent 自修复。
- Planner/Builder/Tester/Reviewer 多 Agent 小项目。
- 开 browser 权限后验证网页。

测试模式打开 prompt audit：

```bash
set DEEPSEEKCODE_PROMPT_AUDIT_DIR=D:\work\agent-test\prompt-audit
deepseekcode --project "D:\work\agent-test" --permission-profile dev
```

导出报告：

```text
/runs report latest "D:\work\agent-test"
```

报告包含模型、token、cache hit/miss、工具调用次数、产物、失败点和修复建议。

## 下一步仍在完善

v0.2.4 是安装命令、默认项目目录、本地 `.deepseekcode` 数据目录、GitHub 网络安装和启动 shell 权限询问的体验修复，不宣称 24 项全量优化已经完成。后续仍会继续推进：

- 全量真实场景评测和失败后自修复覆盖。
- 长任务后台 worker pool、队列恢复、cancel/retry/resume 细节。
- Office/PPT 质量增强，包括模板、图表、图片、渲染检查。
- TUI 键鼠真实交互验收，包括滚轮、历史输入、picker、权限框。
- Browser CDP/GUI 自动化能力边界。
- 模型切换、费用、token、cache hit/miss 的实时 UI 打磨。

## 架构和构建检查

架构见 [Architecture](./ARCHITECTURE.md)。

```bash
npm run typecheck
npm run build
```

仓库包含 typecheck/build CI 和 website GitHub Pages 部署；v0.2.4 继续保持 CI 构建脚本在发布仓库内可用。

## 发布边界

发布树只包含运行源码、公开资源、官网、README 和用户说明书。测试产物、prompt audit、`.env`、`node_modules`、运行时数据库、handoff 和开发草稿不属于发布内容。

## License

MIT

