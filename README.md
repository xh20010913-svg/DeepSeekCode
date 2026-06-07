# DeepSeekCode

[中文](./README.zh-CN.md) | [Guide](./GUIDE.md) | [Architecture](./ARCHITECTURE.md) | [CLI Reference](./CLI_REFERENCE.md) | [Development](./DEVELOPMENT.md) | [API Reference](./API_REFERENCE.md) | [Website](https://xh20010913-svg.github.io/DeepSeekCode/)

DeepSeekCode is a DeepSeek-first local agent runtime for real project workspaces. It connects native function calling, local files, shell/browser permissions, project state, skills, plugins, MCP, WeChat remote control, multi-agent workflows, and task verification.

v0.3.1 focuses on a generic execution loop: create a task contract, execute with tools, verify real outputs, feed failures back to the model, and retry with a better strategy. HTML is only one artifact type. The same `verify_task` entry point also covers code projects, CLI scripts, Office/PDF files, spreadsheets, reports, data tasks, media artifacts, MCP, plugins, and automation jobs.

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
- expected artifacts
- verifiable behaviors
- user constraints
- acceptance criteria

`verify_task` is the generic completion gate. It selects checks from real files, package scripts, artifact types, and the contract:

- code projects: install/build/test/start and dependency diagnostics
- CLI/scripts: command output, exit code, and generated files
- browser-viewable work: screenshot, blank page, console errors, missing assets
- DOCX/PPTX/XLSX/PDF: package structure and render/openability checks
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

Natural language can start a visible multi-agent workflow. User-defined roles are preserved. If no roles are supplied, DeepSeekCode creates Planner, Builder, Tester, and Reviewer roles. Reviewer uses the generic task contract rather than a web-specific checklist.

When a multi-agent workflow starts, DeepSeekCode serves the bundled Pixel Agents read-only panel for that run. In TUI mode it opens the local browser once; remote channels receive a tokenized link when `DEEPSEEKCODE_AGENT_PANEL_PUBLIC_BASE_URL` points to a secure tunnel. The panel shows:

- objective, phase, stale state, recent tool, token/cache summary
- role cards with responsibility, current task, assigned work, blockers, skills, tools, and acceptance criteria
- task board for queued, running, review, completed, and failed work
- collaboration timeline with handoffs, tools, approvals, validation, and repair events
- artifacts, entry points, validation state, and `agent-trace.jsonl`

DeepSeekCode emits runtime snapshots, SSE updates, and Pixel-style JSONL. Pixel Agents is the presentation layer; DeepSeekCode no longer maintains a separate hand-written multi-agent dashboard UI.

Backup commands:

```text
/agents dashboard
/agents dashboard share
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
| `/cache report` | Cache hit/miss and prompt-shape diagnostics |

## Capability Status

| Capability | Status | Notes |
| --- | --- | --- |
| Native DeepSeek tool calls | Verified | Provider requires a tools array |
| Files, patches, search | Verified | Typed registry and Zod validation |
| Windows shell diagnostics | Verified | POSIX and native dependency failures are classified |
| Generic `verify_task` | Verified | Multiple artifact types and package/script checks |
| Office/PDF/spreadsheets | Partial | Structure checks work; richer visual previews are still improving |
| Skills/plugins | Partial | Install, search, invoke work; more regression tests are needed |
| MCP | Experimental | Unified path exists; real service matrix is still growing |
| Multi-agent workflow | Experimental | Visible workflow and reviewer contract are wired; deeper role execution is next |
| Personal WeChat OpenClaw | Experimental | Remote control works; QR/network/image-preview stability is still improving |
| WeCom | Experimental | Kept as an enterprise remote channel |
| computer_use | Reserved | Not advertised as complete |

## Testing

```cmd
npm.cmd run typecheck
npm.cmd run build
npm.cmd pack --dry-run
```

Real scenario tests should be run in `D:\code\DeepSeekTest`. Do not publish `.env`, prompt audit logs, test reports, node_modules, or generated scenario artifacts.

## References

DeepSeek Function Calling, DeepSeek Context Caching, Claude Code subagents/skills/hooks/MCP, MCP TypeScript SDK, Playwright screenshots, Pixel Agents, and browser-use informed the v0.3.1 direction.
