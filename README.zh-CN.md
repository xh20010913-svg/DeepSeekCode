<p align="center">
  <img src="assets/deepseekcode-logo.svg" alt="DeepSeekCode" width="640"/>
</p>

<p align="center">
  <a href="./README.md">English</a>
  &nbsp;|&nbsp;
  <strong>简体中文</strong>
  &nbsp;|&nbsp;
  <a href="./README.ja-JP.md">日本語</a>
  &nbsp;|&nbsp;
  <a href="https://xh20010913-svg.github.io/DeepSeekCode/">Website</a>
  &nbsp;|&nbsp;
  <a href="./GUIDE.md">Guide</a>
  &nbsp;|&nbsp;
  <a href="./ARCHITECTURE.md">Architecture</a>
  &nbsp;|&nbsp;
  <a href="./CLI_REFERENCE.md">CLI</a>
</p>

<p align="center">
  <a href="https://github.com/xh20010913-svg/DeepSeekCode"><img src="https://img.shields.io/github/stars/xh20010913-svg/DeepSeekCode.svg?style=flat-square&color=dbab09&labelColor=161b22&logo=github&logoColor=white" alt="GitHub stars"/></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/xh20010913-svg/DeepSeekCode.svg?style=flat-square&color=8b949e&labelColor=161b22" alt="license"/></a>
  <a href="./package.json"><img src="https://img.shields.io/badge/node-%3E%3D22-5fa04e.svg?style=flat-square&labelColor=161b22&logo=nodedotjs&logoColor=white" alt="Node >= 22"/></a>
  <a href="./package.json"><img src="https://img.shields.io/badge/runtime-TypeScript-3178c6.svg?style=flat-square&labelColor=161b22&logo=typescript&logoColor=white" alt="TypeScript"/></a>
  <a href="https://platform.deepseek.com"><img src="https://img.shields.io/badge/provider-DeepSeek-38bdf8.svg?style=flat-square&labelColor=161b22" alt="DeepSeek provider"/></a>
</p>

<h3 align="center">面向终端工作、本地工具和长任务的 DeepSeek-first 编程 Agent。</h3>

<p align="center">
  <img src="assets/readme-runtime-terminal.png" alt="DeepSeekCode running in Windows Terminal" width="880"/>
</p>

DeepSeekCode 是一个 TypeScript 本地 Agent 运行时。它把稳定的系统规则、工具 schema、项目记忆、仓库事实和 cache pins 放在 prompt 前段，把当前用户请求和压缩后的工具反馈放在后段，用来提升 DeepSeek 前缀缓存复用率。

## 当前能力

- 文件读取、写入、补丁、shell、浏览器、Office 产物、MCP、skills 和产物验证等类型化本地工具。
- SQLite 持久化 runs、actions、artifacts、tasks、approvals、validations、usage 和 cache telemetry。
- CLI 重启后可用 `--continue` 或 `--resume <session-id>` 恢复会话。
- 持久化 compact `tool_result_summary`，避免把完整 stdout、长 diff、长日志反复塞回 prompt。
- `runtime_run_state` 会把未完成 run、任务 DAG、失败原因、产物、剩余工作压缩后传回下一轮。
- 多 Agent Planner -> Builder -> Tester -> Reviewer 链路，带角色级 compact 反馈和 progress checkpoint。
- GitHub Pages 官网、README 图片和公开资源均使用 GitHub 可渲染路径。

## 安装

需要 Node.js >= 22。

```bash
git clone https://github.com/xh20010913-svg/DeepSeekCode.git
cd DeepSeekCode
npm install
npm run build
```

本地配置 DeepSeek：

```bash
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-v4-flash
```

先在独立测试目录启动：

```bash
npm run start -- --project "D:\code\DeepSeekTest"
```

CLI 重启后继续最新会话：

```bash
npm run start -- --project "D:\code\DeepSeekTest" --continue -p "继续上一个任务"
```

恢复指定会话：

```bash
npm run start -- --project "D:\code\DeepSeekTest" --resume session_xxx -p "继续暂停的工作"
```

## 真实场景验证

这个发布版在 `D:\code\DeepSeekTest` 跑过真实 agent 场景：

- 跨进程会话恢复：创建 Node.js 订单项目，继续加入优惠券能力，再继续写验收报告。
- 多 Agent 流程：通过 Planner、Builder、Tester、Reviewer 生成 SaaS incident handoff package。
- Prompt 审计确认 `recent_conversation`、`tool_result_summary`、`runtime_run_state` 都进入了提交给模型的 prompt。
- `.release` 目录内 typecheck 和 build 均通过。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `/doctor` | 检查 provider、模型、路径和权限。 |
| `/model` | 打开 TUI 模型选择器，用方向键和 Enter 切换。 |
| `/model flash` / `/model pro` | 在当前会话中切换 `deepseek-v4-flash` 和 `deepseek-v4-pro`。 |
| `/cache` | 查看缓存准备度、profile、guard policy 和 prompt shape。 |
| `/sessions` / `/resume` | 查看或聚焦持久化会话。 |
| `/runs` / `/trace` | 查看持久化 run/action/task 状态。 |
| `/queue` / `/pause` / `/run-resume` | 查看和控制任务队列。 |
| `/multi provider <task>` | 运行 Planner -> Builder -> Tester -> Reviewer 工作流。 |
| `/validation` / `/approval` | 查看验证门和审批门。 |

完整命令见 [CLI Reference](./CLI_REFERENCE.md)。

## 架构

DeepSeekCode 参考 ClaudeCode 风格的工具调用链路，并针对 DeepSeek 做了缓存和上下文恢复适配：

1. 构建稳定 prompt 前缀和动态上下文块。
2. 判断本轮是否需要本地工具。
3. 让 provider 返回类型化 action envelope。
4. 本地 runtime 执行工具，并处理路径、权限和验证。
5. 持久化 compact tool feedback、run checkpoint、产物、usage 和 cache telemetry。
6. 下一轮只把高价值摘要传回 prompt。

更多细节见 [Architecture](./ARCHITECTURE.md)。

## 发布范围

发布树只包含运行源码、官网、README、公开资源和用户文档；不提交 `.env`、本地测试产物、research notes、staging 目录、运行时数据库、`node_modules` 和私有开发交接文档。

## 链接

- [Guide](./GUIDE.md)
- [Architecture](./ARCHITECTURE.md)
- [CLI Reference](./CLI_REFERENCE.md)
- [Website Guide](./website/guide.html)

## License

MIT
