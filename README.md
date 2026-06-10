<p align="center">
  <img src="website/favicon.svg" alt="DeepSeekCode" width="112"/>
</p>

<h1 align="center">DeepSeekCode</h1>

<p align="center">
  <strong>English</strong>
  &nbsp;·&nbsp;
  <a href="./README.zh-CN.md">简体中文</a>
  &nbsp;·&nbsp;
  <a href="./GUIDE.md">Guide</a>
  &nbsp;·&nbsp;
  <a href="./ARCHITECTURE.md">Architecture</a>
  &nbsp;·&nbsp;
  <a href="./CLI_REFERENCE.md">CLI</a>
  &nbsp;·&nbsp;
  <a href="./API_REFERENCE.md">API</a>
  &nbsp;·&nbsp;
  <a href="https://xh20010913-svg.github.io/DeepSeekCode/">Website</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@xh12312/deepseekcode"><img src="https://img.shields.io/npm/v/@xh12312/deepseekcode.svg?style=flat-square&color=cb3837&labelColor=161b22&logo=npm&logoColor=white" alt="npm version"/></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/@xh12312/deepseekcode.svg?style=flat-square&color=8b949e&labelColor=161b22" alt="license"/></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22-3fb950?style=flat-square&labelColor=161b22&logo=node.js&logoColor=white" alt="Node >=22"/>
  <a href="https://github.com/xh20010913-svg/DeepSeekCode"><img src="https://img.shields.io/github/stars/xh20010913-svg/DeepSeekCode.svg?style=flat-square&color=dbab09&labelColor=161b22&logo=github&logoColor=white" alt="GitHub stars"/></a>
</p>

> [!IMPORTANT]
> v0.3.4 is a local-first runtime hardening release: Agent Kernel lifecycle events, prompt-budget records, structured evidence, stronger multi-agent quality gates, a rebuilt Pixel operations room, cache trends, validation explainability, local git diagnostics, real PDF validation, project process management, and Windows terminal recovery are designed for local acceptance before npm publish.

DeepSeekCode is a DeepSeek-first local agent runtime for real project workspaces. It connects native function calling, local files, shell/browser permissions, project state, skills, plugins, MCP, WeChat remote control, multi-agent workflows, and task verification.

v0.3.4 focuses on the generic Agent Kernel loop: normalize intent into a task contract, budget every provider call, execute with tools, store structured evidence, verify real outputs, feed failures back to the model, and retry with a better strategy. HTML is only one artifact type. The same `verify_task` entry point also covers code projects, CLI scripts, real PDF files, Office files, spreadsheets, reports, data tasks, media artifacts, MCP, plugins, and automation jobs.

## Install

```cmd
npm install -g @xh12312/deepseekcode --registry https://registry.npmjs.org/
cd /d D:\code\DeepSeekTest
deepseekcode --model deepseek-v4-flash
```

The public command is `deepseekcode`. The package does not install a `deepseek` alias to avoid collisions with other tools.

From source:

```cmd
git clone https://github.com/xh20010913-svg/DeepSeekCode.git
cd DeepSeekCode
npm install
npm run build
npm run start -- --project "D:\code\DeepSeekTest" --model deepseek-v4-flash
```

Environment:

```env
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEKCODE_LANGUAGE=zh-CN
```

## Runtime Screenshots

| Desktop TUI mirrors WeChat input/output | Personal WeChat remote result |
| --- | --- |
| ![Desktop TUI mirrors WeChat input and output](assets/screenshots/wechat-desktop-sync.png) | ![Personal WeChat remote result](assets/screenshots/wechat-mobile-result.png) |

GSAP skill is discovered and invoked for an animation task, then the entry artifact is validated:

![GSAP skill invocation test](assets/screenshots/gsap-skill-run.png)

## Core Concepts

### Native tool loop

DeepSeekCode requires native function calling. The model emits `tool_calls`; the runtime validates parameters, applies permission gates, executes local tools, stores concise tool results, and feeds failures back to the next model turn.

### Generic task contract

For non-chat work, the model and runtime operate around a `TaskCompletionContract`:

- goal
- expected outputs with `kind`, `description`, and `required`
- acceptance criteria
- user constraints
- verification hints

`verify_task` is the generic completion gate. It selects checks from real files, package scripts, artifact types, and the contract:

- code projects: install/build/test/start and dependency diagnostics
- CLI/scripts: command output, exit code, and generated files
- browser-viewable work: screenshot, blank page, console errors, missing assets
- PDF: real `.pdf` generation, header/page structure checks, and optional preview rendering
- DOCX/PPTX/XLSX: package structure and render/openability checks
- markdown/reports: structure and requested sections
- data work: CSV/XLSX/JSON/schema and result consistency
- images/media: format, dimensions, previewability
- MCP/plugins/skills: install, discovery, invocation, and returned results

When verification fails, the failure is replayed as a tool result so the model can repair and verify again.

### Windows command reliability

`run_command` executes in PowerShell on Windows. It detects common POSIX commands such as `mkdir -p`, `cat`, `rm -rf`, here-docs, and bash-style pipes before execution. It also classifies `node-gyp`, Visual Studio, Node version, native dependency, port, and install failures so the model can switch strategy instead of retrying the same broken command.

### Skills, plugins, MCP

Skills and plugins can be installed from local paths, GitHub repo paths, Git URLs, and `file://` Git sources. The model can use `search_skills` and `invoke_skill` automatically when a task matches an installed skill.

MCP tools are routed through the same tool-result, permission, hook, audit, and verification path. MCP is still marked experimental until more real service tests are covered.

### Multi-agent workflows

Natural language can start a visible, plan-gated multi-agent workflow. DeepSeekCode first creates a reviewable Planner proposal, then waits for the user to choose execute, revise, regenerate, or cancel. `Planner` and `AcceptanceReviewer` are the only fixed roles; the middle execution roles are generated from the task contract, output types, tools, and verification risk. Each role keeps role-local assigned subtasks, transcript snippets, tool-result summaries, checkpoint, allowed tools, generated workflow-local skill, risk checks, and handoff format. `AcceptanceReviewer` uses the generic task contract and real evidence rather than a web-specific checklist.

When a multi-agent workflow starts, DeepSeekCode serves the bundled Pixel Agents read-only panel for that run. In TUI mode it opens the local browser once; remote channels receive a tokenized link when `DEEPSEEKCODE_AGENT_PANEL_PUBLIC_BASE_URL` points to a secure tunnel. For temporary WeChat phone viewing, `/agents dashboard tunnel` can start a Cloudflare Quick Tunnel and print a random `trycloudflare.com` HTTPS link. The link is still reachable by anyone who has the URL and token, so do not post it publicly. The panel shows:

- objective, phase, approval state, stale state, recent tool, token/cache summary
- dynamic role cards with responsibility, context scope, generated skill, current subtask, checkpoints, blockers, tools, risk checks, and acceptance criteria
- Planner subtask graph with all, unfinished, running, needs-review, completed, failed, and blocked views
- task dependencies, assignees, evidence, latest events, artifacts, and validation summaries
- a responsive task cockpit overlay for desktop and WeChat phone viewing

DeepSeekCode emits runtime snapshots, SSE/WebSocket updates, and Pixel-style JSONL. Pixel Agents is the presentation layer; DeepSeekCode no longer maintains a separate hand-written multi-agent dashboard UI. Labels are short by default; long prompts, stack traces, checkpoints, and role transcripts live in the snapshot/diagnostics payload.

The Pixel overlay is now a full-screen operations room fed only by the run snapshot: left side is the task board, workstations, dispatch area, lounge, evidence corner, and live role movement; right side is the task console with roles, DAG tasks, evidence, spans, cache/budget trend, and details. On phones and WeChat it switches to a summary-first layout with a bottom detail drawer instead of squeezing the office scene.

Backup commands:

```text
/agents dashboard
/agents dashboard share
/agents dashboard tunnel
/agents dashboard trace
/agents dashboard close
```

### Remote control

Two remote channels are available:

- WeCom AI Bot: experimental.
- Personal WeChat OpenClaw: experimental.

Remote messages share the same project runtime and permission gates. WeChat receives concise progress, approvals, read-only `/ask` answers, and final results rather than console logs or source-code floods.

## Common Commands

| Command | Purpose |
| --- | --- |
| `/doctor` | Provider, paths, native tools, skills/plugins, cache, permissions |
| `/tools` | Real registered tools |
| `/model`, `/model flash`, `/model pro` | Model selection |
| `/language zh\|en` | UI language |
| `/shell on`, `/shell off` | Shell permission |
| `/skills`, `/skills install <source>` | Skills |
| `/plugins`, `/plugins install <source>` | Plugins |
| `/mcp` | MCP status |
| `/remote-control` | WeChat/WeCom remote binding |
| `/ask <question>` | Read-only side question while a long task runs |
| `/status`, `/status full` | Task progress |
| `/compact` | Build a five-part session capsule for long-context recovery |
| `/cache report` | Cache hit/miss and prompt-shape diagnostics |
| `/cache trend` | Recent cache hit rate, stable-prefix drift, dynamic block size, and pin suggestions |
| `/memory doctor` | TencentDB memory recall/capture diagnostics |
| `/agent doctor` | Agent Kernel, workflow, evidence, budget, and process diagnostics |
| `/verify explain` | Explain validation gates and evidence for the latest or selected run |
| `/dashboard reset` | Restart the Pixel panel server when a browser view is stale |
| `/git doctor` | Inspect local git branch, origin, status, and proxy settings |
| `/project processes` | List services started by `launch_project` |
| `/project stop latest\|<pid>\|all` | Stop launched project services without exiting the TUI |
| `/terminal reset` | Restore Windows terminal modes if mouse/paste escape sequences leak |

## Capability Status

| Capability | Status | Notes |
| --- | --- | --- |
| Native DeepSeek tool calls | Verified | Provider requires a tools array |
| Files, patches, search | Verified | Typed registry and Zod validation |
| Windows shell diagnostics | Verified | POSIX and native dependency failures are classified |
| Generic `verify_task` | Verified | Multiple artifact types and package/script checks |
| PDF artifacts | Verified | `create_pdf` generates real PDF files and validates `%PDF`, page count, and readable structure |
| Office/spreadsheets | Partial | DOCX/PPTX/XLSX structure checks work; richer visual previews are still improving |
| Skills/plugins | Partial | Install, search, invoke work; more regression tests are needed |
| MCP | Experimental | Unified path exists; real service matrix is still growing |
| Multi-agent workflow | Experimental | Plan gate, dynamic roles, workflow-local role skills, subtask graph, Pixel observer, and AcceptanceReviewer contract are wired; broader scenario tests continue |
| Personal WeChat OpenClaw | Experimental | Remote control works; QR/network/image-preview stability is still improving |
| WeCom | Experimental | Kept as an enterprise remote channel |
| computer_use | Reserved | Not advertised as complete |

## Testing

```cmd
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test
npm.cmd pack --dry-run
npm.cmd pack
```

Real scenario tests should be run in `D:\code\DeepSeekTest`. Do not publish `.env`, prompt audit logs, test reports, node_modules, or generated scenario artifacts.

## References

DeepSeek Function Calling, DeepSeek Context Caching, Claude Code subagents/skills/hooks/MCP, MCP TypeScript SDK, Playwright screenshots, Pixel Agents, and browser-use informed the v0.3.4 direction.
