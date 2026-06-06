# DeepSeekCode 使用指南

这份指南面向真实使用和验收。开发者细节见 [DEVELOPMENT.md](./DEVELOPMENT.md)，接口说明见 [API_REFERENCE.md](./API_REFERENCE.md)。

## 1. 安装与启动

```cmd
npm install -g @xh12312/deepseekcode --registry https://registry.npmjs.org/
cd /d D:\code\DeepSeekTest
deepseekcode --model deepseek-v4-flash
```

当前目录就是项目根目录，运行数据写入：

```text
D:\code\DeepSeekTest\.deepseekcode
```

源码模式：

```cmd
cd /d D:\code\DeepSeekCode\.release
npm install
npm run build
npm run start -- --project "D:\code\DeepSeekTest" --model deepseek-v4-flash
```

## 2. 模型配置

```env
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEKCODE_LANGUAGE=zh-CN
```

TUI 内切换：

```text
/model
/model flash
/model pro
```

日常测试建议用 flash；复杂规划、长任务和多 Agent 可切 pro。

## 3. 权限模型

DeepSeekCode 不靠用户输入里的关键词判断任务。模型通过 native tool call 请求工具，runtime 在工具执行前统一做权限、安全和平台兼容性校验。

```text
/shell on
/shell off
/browser on
/browser off
/permissions
```

权限体验：

- shell 默认关闭，启动 TUI 时可选择本会话开启。
- shell 命令执行前仍会进入 permission gate。
- TUI 用方向键/Enter 选择。
- 个人微信用 `1/2/3/4` 数字审批。
- 企业微信在支持时使用模板卡片审批。

## 4. Windows 命令兼容

`run_command` 会在执行前做 Windows preflight。它只检查命令是否适合当前平台，不判断用户任务意图。

会提示修复的常见问题：

- `mkdir -p`、`cat`、`touch`、`rm -rf`、`cp -r`、`ls -la`。
- bash heredoc、`/dev/null`、明显的 bash-only 语法。
- `node-gyp`、Visual Studio 缺失、Node 版本不兼容、端口占用、依赖安装失败。

模型收到失败 tool_result 后，应修命令、换纯 JS 依赖、降低依赖复杂度或说明需要用户安装系统组件。

## 5. 项目验收与启动

通用验收工具：

- `verify_project`
- `launch_project`
- `browser_agent`

推荐让 agent 在代码项目完成后执行验收：

```text
完成后请安装依赖、启动项目、检查浏览器页面是否空白，有报错就自动修复。
```

runtime 会按真实文件选择策略：

| 发现内容 | 行为 |
| --- | --- |
| `package.json` | 安装依赖、运行 build/test/start/dev。 |
| HTML | 打开浏览器、截图、检查空白页、资源缺失和 console 错误。 |
| 后端服务 | 启动服务，检查端口和 health。 |
| Office/PDF | 检查文件存在、大小和预览能力。 |
| 多文件项目 | 输出入口、manifest、截图和启动命令。 |

失败会回放给模型，让它修复后重新验收。

## 6. 微信远程控制

推荐在电脑 TUI 内绑定：

```text
/remote-control
/remote-control wechat login
/remote-control wechat start
/remote-control wecom start
```

纯远程模式：

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
/run 继续完成这个项目
/continue
/stop
/artifacts
/usage
/shell on
/shell off
```

普通聊天按聊天回复。任务请求进入本地 runtime。长任务运行中，`/ask` 是只读旁路问答，不写文件、不执行 shell、不影响主任务。

## 7. 远程产物回传

产物回传由 runtime 根据真实文件判断：

| 产物 | 回传 |
| --- | --- |
| HTML | 优先浏览器截图，再发入口摘要，不刷屏发源码。 |
| DOCX/PPTX/XLSX | 发微信可打开的原文件。 |
| PDF | 发 PDF；后续可补页图预览。 |
| 图片 | 直接发图片。 |
| Markdown/TXT | 默认发短摘要；按需发文件。 |
| 多文件项目 | 发摘要、入口、截图、manifest。 |

如果截图或发图失败，会降级为本地预览路径和失败原因。

## 8. Skills、Plugins、MCP

```text
/skills install "D:\skills\office-report"
/skills install greensock/gsap-skills
/skills install-all greensock/gsap-skills
/skills search gsap
/skills validate
/skills run gsap-core "给当前网页加动画"
```

自动调用规则：

- `search_skills` 和 `invoke_skill` 是 native tools。
- 模型根据任务语义决定是否搜索和调用 skill。
- 不需要用户每次都说“使用某个 skill”。
- `description` 写得越清楚，自动调用越可靠。

MCP：

```text
/mcp list
/mcp status
/mcp call <server> <tool> <json>
```

MCP 当前通过统一 `mcp_call` 接入。权限、hooks、tool_result 摘要规则和本地工具一致。

## 9. 多 Agent 与旁路问答

自然语言可以启动多 Agent：

```text
开启多 agent 协作，让前端、后端、测试和验收一起完成这个在线商城。
```

如果没有指定角色，主模型会按项目自动设计角色，并默认加入 Reviewer。Reviewer 负责检查：

- 是否真的生成了产物。
- 是否能启动。
- 页面是否空白或报错。
- build/test 是否通过。
- 是否满足原始需求。

旁路问答：

```text
/ask 现在做到哪了？
/ask 生成了哪些文件？
/ask 这个项目为什么卡住？
```

## 10. 缓存与费用

```text
/cache
/cache report
/usage
/cost
```

缓存优化重点：

- 稳定 prompt block 顺序。
- 固定工具 schema 排序。
- 长工具结果只保留摘要。
- 历史分为最近对话、rolling summary、run_state、artifact manifest。
- `/cache report` 给出低命中原因和可操作建议。

## 11. 测试与发布

测试产物只放独立目录，例如 `D:\code\DeepSeekTest`。

基础检查：

```cmd
npm.cmd run typecheck
npm.cmd run build
npm.cmd pack --dry-run
```

打包给 npm 发布：

```cmd
npm.cmd pack --pack-destination D:\code\DeepSeekTest\npm-packages
```

GitHub 发布只从 `.release` 提交，不提交测试目录、`.env`、prompt audit、运行数据库、登录态、node_modules 或临时 tarball。
