<p align="center">
  <img src="docs/assets/deepseekcode-logo.svg" alt="DeepSeekCode" width="640"/>
</p>

<p align="center">
  <a href="./README.md">English</a>
  &nbsp;·&nbsp;
  <strong>简体中文</strong>
  &nbsp;·&nbsp;
  <a href="./README.ja-JP.md">日本語</a>
  &nbsp;·&nbsp;
  <a href="./website/">Website</a>
  &nbsp;·&nbsp;
  <a href="./docs/WEBSITE_GUIDE.md">Guide</a>
  &nbsp;·&nbsp;
  <a href="./docs/ARCHITECTURE.md">Architecture</a>
  &nbsp;·&nbsp;
  <a href="./docs/CLI_REFERENCE.md">CLI</a>
</p>

<p align="center">
  <a href="https://github.com/xh20010913-svg/DeepSeekCode"><img src="https://img.shields.io/github/stars/xh20010913-svg/DeepSeekCode.svg?style=flat-square&color=dbab09&labelColor=161b22&logo=github&logoColor=white" alt="GitHub stars"/></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/xh20010913-svg/DeepSeekCode.svg?style=flat-square&color=8b949e&labelColor=161b22" alt="license"/></a>
  <a href="./package.json"><img src="https://img.shields.io/badge/node-%3E%3D22-5fa04e.svg?style=flat-square&labelColor=161b22&logo=nodedotjs&logoColor=white" alt="Node >= 22"/></a>
  <a href="./package.json"><img src="https://img.shields.io/badge/runtime-TypeScript-3178c6.svg?style=flat-square&labelColor=161b22&logo=typescript&logoColor=white" alt="TypeScript"/></a>
  <a href="https://platform.deepseek.com"><img src="https://img.shields.io/badge/provider-DeepSeek-38bdf8.svg?style=flat-square&labelColor=161b22" alt="DeepSeek provider"/></a>
  <a href="./docs/ARCHITECTURE.md#pillar-1-cache-first-loop"><img src="https://img.shields.io/badge/cache-prefix%20stable-22c55e.svg?style=flat-square&labelColor=161b22" alt="Prefix cache strategy"/></a>
</p>

<br/>

<h3 align="center">面向终端工作、本地工具和长任务的 DeepSeek-first 编程 Agent。</h3>
<p align="center">DeepSeekCode 围绕 DeepSeek 缓存命中、TypeScript 模块、持久化状态和显式本地工具执行设计。</p>

<br/>

<p align="center">
  <img src="docs/assets/readme-runtime-terminal.png" alt="DeepSeekCode running in Windows Terminal" width="880"/>
</p>

<br/>

> [!TIP]
> DeepSeekCode 把前缀缓存稳定性当作运行时不变量：稳定规则、工具 schema、项目记忆、仓库 map、cache pin 放在前面且保持确定顺序；用户当前输入和工具反馈放在后面。

> [!IMPORTANT]
> DeepSeekCode 把 DeepSeek 缓存保护、结构化动作、审批门、Windows-safe TUI 输入和项目记忆做成核心能力。

<br/>

## 安装

需要 Node.js >= 22。支持 Windows Terminal / PowerShell、macOS、Linux。

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

启动到任意项目目录：

```bash
npm run start -- --project "D:\code\DeepSeekTest"
```

开发和检查：

```bash
npm run dev -- --project "D:\code\DeepSeekTest"
npm run doctor
npm run smoke
npm run parity
```

| 命令 | 用途 |
| --- | --- |
| `npm run start -- --project <dir>` | 启动 Ink/React 终端 Agent。 |
| `npm run dev -- --project <dir>` | 开发时直接运行 TypeScript。 |
| `npm run doctor` | 检查 Node、项目路径、provider、权限和状态路径。 |
| `npm run smoke` | 运行本地安全和运行时测试。 |
| `npm run parity` | 检查公开模块布局和本地架构 parity map。 |

<details>
<summary><strong>Slash 命令、项目边界和安全默认值</strong></summary>

DeepSeekCode 会把文件工具限制在 `--project` 指定的项目目录内。Shell 和浏览器默认关闭，需要显式开启。

```text
/help
/doctor
/status
/config
/cache
/cache guard <goal>
/cache prepare <goal>
/cache profile save <name> <goal>
/model verify
/shell on|off
/browser on|off
/cmd <command>
/diff git
/approval list
/plan start|show|approve|reject|cancel
/memory list|accepted|export
/skills
/plugins
/mcp
/multi provider <task>
/quit
```

完整命令见 [CLI Reference](./docs/CLI_REFERENCE.md)。

</details>

<br/>

## 配置

DeepSeekCode 从环境变量和本地项目配置读取运行参数。

| 主题 | 快速说明 |
| --- | --- |
| DeepSeek provider | `DEEPSEEK_BASE_URL`、`DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`；真实 smoke 默认使用 `deepseek-v4-flash`。 |
| 缓存保护 | `/cache guard`、`/cache prepare`、`/cache profile` 和 `.deepseekcode/cache-guard.json` 会在大任务前检查 prompt shape。 |
| 工具 | 文件、patch、shell、browser-open、validation、diff、approval、memory、skills、plugins、MCP 都走 typed tool 边界。 |
| 权限 | Shell/browser 默认关闭；文件修改、命令、浏览器、MCP、plan 决策都有审批和 trace。 |
| 状态 | runs、tasks、actions、events、artifacts、usage、memory、approval、cache telemetry 都是持久化的。 |
| Website | [Website Guide](./docs/WEBSITE_GUIDE.md) 说明静态官网、截图、页面结构和 GitHub Pages 发布方式。 |

<br/>

## DeepSeekCode 的不同点

DeepSeekCode 围绕三根主线设计：

1. **Cache-first loop**：稳定前缀、内容无关的 shape 记录、cache pin、preflight/guard/prepare 命令、provider cache hit/miss 统计。
2. **Typed local action runtime**：模型只提出结构化动作，DeepSeekCode 再校验路径、权限、工具和产物。
3. **Durable long-running work**：run、任务 DAG、Planner/Builder/Tester/Reviewer、rework、approval、memory promotion、trace 都能跨终端刷新保留。

完整说明见 [Architecture](./docs/ARCHITECTURE.md)。

<br/>

## 能力图

<p align="center">
  <img src="docs/assets/deepseekcode-feature-grid.svg" alt="DeepSeekCode capabilities" width="880"/>
</p>

<br/>

## 对比

| 方向 | DeepSeekCode | 终端 SaaS 工具 | IDE Agent | Patch-first CLI |
| --- | --- | --- | --- | --- |
| 主要 provider | DeepSeek-first | 混合 | 混合 | 多 provider |
| UI | Ink/React 终端工作台 | Web 或桌面 | IDE 面板 | CLI |
| 缓存策略 | Cache guard、pins、profiles、telemetry、prompt-shape tracking | 隐式或依赖 provider | 隐式或依赖 provider | 依赖 provider |
| 本地工具 | 结构化 action envelope + approval gates | workspace integrations | IDE integrations | Git/file edit loop |
| 多 Agent | Planner -> Builder -> Tester -> Reviewer 持久任务 | workflow automation | agent tabs/tasks | 有限 |
| 扩展性 | Skills、plugins、MCP、hooks、bridge | marketplace-oriented | extension-oriented | 脚本/config |
| 项目状态 | SQLite runs/tasks/actions/events/memory | 云端或 workspace state | IDE state | repository diff |

目标不是扮演某个现成工具，而是做一个 DeepSeek-native、本地可控、长时间工作也省 token 的编程 Agent。

<br/>

## 文档

- [Website Guide](./docs/WEBSITE_GUIDE.md)：官网首页、guide 页、截图、GitHub Pages 和文案规则。
- [Architecture](./docs/ARCHITECTURE.md)：缓存循环、动作运行时、持久化状态、TUI、工具、skills、plugins、MCP。
- [CLI Reference](./docs/CLI_REFERENCE.md)：启动参数、slash 命令、测试命令和真实模型 smoke 规则。
- [Technical Architecture](./docs/TECHNICAL_ARCHITECTURE.md)：更深入的内部实现说明。
- [Architecture Parity Status](./docs/CLAUDE_CODE_PARITY_STATUS.md)：模块覆盖、兼容适配和迁移记录。
- [Open Source References](./docs/OPEN_SOURCE_REFERENCES.md)：公开技术调研和比较矩阵。

<br/>

## 社区

欢迎在 [xh20010913-svg/DeepSeekCode](https://github.com/xh20010913-svg/DeepSeekCode) 提 issue、discussion、截图和使用反馈。适合作为 first contribution 的方向包括 UI polish、文档、缓存 telemetry 检查、命令面板、Windows terminal 行为和安全工具适配。

首次 PR 前请阅读 [Contributing](./CONTRIBUTING.md)，并附上 `npm run build`、`npm run smoke` 或真实 `deepseek-v4-flash` smoke 的验证结果。

<br/>

## Star History

<a href="https://www.star-history.com/?repos=xh20010913-svg%2FDeepSeekCode&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=xh20010913-svg/DeepSeekCode&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=xh20010913-svg/DeepSeekCode&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=xh20010913-svg/DeepSeekCode&type=date&legend=top-left" />
 </picture>
</a>

<br/>

## 致谢

DeepSeekCode 吸收了公开终端编码 Agent、DeepSeek cache-first runtime、MCP、typed tools、本地 approval flow 等方向的经验。公开代码、命名、文档和产品行为都保持 DeepSeekCode 自己的设计。

<br/>

---

<p align="center">
  <sub>MIT · see <a href="./LICENSE">LICENSE</a></sub>
  <br/>
  <sub>Built for DeepSeek-first local coding at <a href="https://github.com/xh20010913-svg/DeepSeekCode">xh20010913-svg/DeepSeekCode</a></sub>
</p>
