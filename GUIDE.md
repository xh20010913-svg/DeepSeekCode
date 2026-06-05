# DeepSeekCode 使用指南

这份指南面向真实使用和验收。更完整的开发说明见 [DEVELOPMENT.md](./DEVELOPMENT.md)，接口说明见 [API_REFERENCE.md](./API_REFERENCE.md)。

## 1. 安装

```cmd
npm install -g @xh12312/deepseekcode --registry https://registry.npmjs.org/
cd /d D:\code\DeepSeekTest
deepseekcode --model deepseek-v4-flash
```

当前目录就是项目根目录。运行数据写入：

```text
D:\code\DeepSeekTest\.deepseekcode
```

源码运行：

```cmd
cd /d D:\code\DeepSeekCode\.release
npm install
npm run build
npm run start -- --project "D:\code\DeepSeekTest" --model deepseek-v4-flash
```

## 2. 配置模型

```env
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEKCODE_LANGUAGE=zh-CN
```

TUI 里切换：

```text
/model
/model flash
/model pro
```

建议日常测试用 flash，复杂规划或长任务再切 pro。

## 3. 权限

DeepSeekCode 不靠用户输入里的“网页”“shell”“PPT”这类词做硬判断。模型通过 native tool call 请求工具，runtime 再统一做权限判断。

常见权限：

- shell：默认关闭，启动时可选择本会话打开。
- browser：默认关闭，需要显式开启。
- MCP/SSH/危险命令：走权限 gate。
- 微信端：个人微信用 `1/2/3/4` 数字审批；企微用卡片审批。

TUI：

```text
/shell on
/shell off
/browser on
/browser off
/permissions
```

## 4. 微信远程

推荐在电脑 TUI 中启动绑定：

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

微信端命令：

```text
/help
/status
/status full
/ask 现在做到哪了
/project
/project D:\code\DeepSeekTest
/run 帮我继续完成这个项目
/continue
/stop
/artifacts
/usage
/shell on
/shell off
```

个人微信 OpenClaw 是实验中能力。二维码、网络、手机插件状态和 OpenClaw 登录态都会影响稳定性。个人微信 PC hook 和逆向协议不属于默认版。

## 5. 远程产物预览

runtime 根据真实产物类型决定回传方式：

| 产物 | 回传 |
| --- | --- |
| HTML | 截图优先，入口摘要，不刷屏发源码。 |
| DOCX/PPTX/XLSX | 发原文件。 |
| PDF | 发 PDF。 |
| 图片 | 直接发图片。 |
| Markdown/TXT | 发短摘要，按需发文件。 |
| 多文件项目 | 发摘要、入口、截图、manifest。 |

如果没有可预览产物，远程端会保存本地摘要并提示 `/artifacts`。

## 6. Skills

安装单个或批量 skill：

```text
/skills install "D:\skills\office-report"
/skills install greensock/gsap-skills
/skills install-all greensock/gsap-skills
/skills search gsap
/skills validate
/skills run gsap-core "给当前网页加动画"
```

模型会根据任务语义自动搜索和调用 skill。你不需要每次都说“使用 GSAP skill”，但 skill 的 `description` 必须写清楚。设置 `disable-model-invocation: true` 的 skill 不会自动调用。

## 7. Plugins 和 MCP

Plugins：

```text
/plugins install "D:\plugins\review-kit"
/plugins install https://github.com/example/deepseekcode-plugin
/plugins validate
/plugins enable review-kit
```

MCP：

```text
/mcp list
/mcp status
/mcp call <server> <tool> <json>
```

MCP 当前通过统一 `mcp_call` 入口接入。权限和 tool_result 摘要规则与本地工具一致。

## 8. 多 Agent 和旁路问答

自然语言可以启动多 Agent：

```text
开启多 agent 协作，让前端、测试和验收一起完成这个页面。
```

没有指定角色时，主模型会设计角色并默认加入 Reviewer。当前是实验中能力，适合测试角色分工、黑板消息和验收结果，不是完整后台 worker pool。

长任务运行中问状态：

```text
/ask 现在做到哪了？
/ask 生成了哪些文件？
/ask 这个项目架构是什么？
```

`/ask` 是只读旁路问答，不写文件、不执行 shell、不打断主任务。

## 9. 真实测试流程

测试目录示例：

```cmd
cd /d D:\code\DeepSeekTest
deepseekcode --model deepseek-v4-flash
```

建议任务：

- 生成全国天气监控 dashboard：开发文档、HTML 入口、浏览器截图。
- 生成 DOCX 项目报告。
- 生成答辩 PPT 或课程 PPT。
- 安装 GSAP skill，让 agent 自动调用并验证页面动画。
- 微信远程发送任务，审批 shell，查看 `/status full` 和 `/artifacts`。
- 多 Agent 角色协作，Reviewer 检查是否真的完成。

基础检查：

```cmd
npm.cmd run typecheck
npm.cmd run build
npm.cmd pack --dry-run
```

## 10. 发布

发布只从 `.release` 做：

```cmd
cd /d D:\code\DeepSeekCode\.release
npm.cmd run typecheck
npm.cmd run build
npm.cmd pack --dry-run
```

正式打包给 npm 发布时，把 tarball 输出到测试目录，例如：

```cmd
npm.cmd pack --pack-destination D:\code\DeepSeekTest\npm-packages
```

GitHub 发布内容只包含 runtime、网站、README、公开说明书和公开资源；测试产物、prompt audit、运行数据库、登录态和临时 tarball 不提交。
