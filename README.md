<p align="center">
  <img src="assets/deepseekcode-logo.svg" alt="DeepSeekCode" width="640"/>
</p>

<p align="center">
  <a href="./README.zh-CN.md">简体中文</a>
  &nbsp;|&nbsp;
  <strong>English</strong>
  &nbsp;|&nbsp;
  <a href="https://xh20010913-svg.github.io/DeepSeekCode/">Website</a>
  &nbsp;|&nbsp;
  <a href="./GUIDE.md">Guide</a>
  &nbsp;|&nbsp;
  <a href="./ARCHITECTURE.md">Architecture</a>
  &nbsp;|&nbsp;
  <a href="./CLI_REFERENCE.md">CLI</a>
  &nbsp;|&nbsp;
  <a href="./DEVELOPMENT.md">Development</a>
  &nbsp;|&nbsp;
  <a href="./API_REFERENCE.md">API</a>
</p>

# DeepSeekCode

DeepSeekCode is a DeepSeek-first local terminal agent runtime. It connects DeepSeek native tool calling, local file tools, shell/browser permission gates, durable project state, long-term memory, skills/plugins, MCP, WeChat remote control, multi-agent workflows, and resumable long tasks in one TypeScript runtime.

The current public release is `v0.2.8`. The docs use honest capability labels: `verified`, `partial`, `experimental`, and `reserved`.

```text
user input / remote message / TUI command
  -> QueryEngine
  -> stable runtime prompt + dynamic context + skill/tool schema
  -> DeepSeek native tool_calls
  -> local typed tools
  -> tool_result messages
  -> next provider turn or final answer
```

The model no longer drives local work by emitting large ActionEnvelope JSON plans. Internal JSON, Zod schemas, and SQLite state still exist for argument validation, configuration, persistence, and reports.

## Real Runtime Screenshots

These screenshots are from real runtime tests, not generated mockups.

| Desktop TUI mirroring WeChat input/output | Personal WeChat remote result |
| --- | --- |
| ![Desktop TUI with WeChat sync](assets/screenshots/wechat-desktop-sync.png) | ![Personal WeChat remote result](assets/screenshots/wechat-mobile-result.png) |

GSAP skill invocation and artifact validation:

![GSAP skill invocation](assets/screenshots/gsap-skill-run.png)

## Quickstart

Requirements:

- Node.js 22 or newer.
- A DeepSeek API key.
- A project directory, for example `D:\code\DeepSeekTest`.

Install globally, then run `deepseekcode` from any project directory. By default, the current directory is the project root and runtime data is written to `.deepseekcode`.

```cmd
npm install -g @xh12312/deepseekcode --registry https://registry.npmjs.org/
cd /d D:\code\DeepSeekTest
deepseekcode --model deepseek-v4-flash
```

The main command is `deepseekcode`. The package intentionally does not install a `deepseek` alias to avoid conflicts with other DeepSeek tools.

Source mode:

```cmd
git clone https://github.com/xh20010913-svg/DeepSeekCode.git
cd DeepSeekCode
npm install
npm run build
npm run start -- --project "D:\code\DeepSeekTest" --model deepseek-v4-flash
```

Common environment variables:

```env
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEKCODE_LANGUAGE=zh-CN
```

## Models And Run Modes

Switch models in the TUI:

```text
/model
/model flash
/model pro
```

Continue after a restart:

```cmd
deepseekcode --project "D:\code\DeepSeekTest" --continue -p "continue the previous task"
deepseekcode --project "D:\code\DeepSeekTest" --resume session_xxx -p "continue the paused task"
```

Diagnose the installation and provider:

```cmd
deepseekcode --doctor
```

## TUI And Permissions

When the TUI starts and shell is off, it asks whether to enable shell for the current session. Use arrow keys to select, Enter to confirm, and Esc/N to keep shell disabled.

Permissions are not keyword rules. When the model needs a command, it requests the `run_command` native tool and the runtime enters a permission gate. The TUI shows tool name, command, cwd, risk, and allow/reject options. WeChat uses numeric approval, and WeCom uses cards where supported.

Core commands:

| Command | Purpose |
| --- | --- |
| `/doctor` | Diagnose provider, native tool calling, paths, skills/plugins, cache, and permissions. |
| `/tools` | List real tools and support status. |
| `/model` | Open the model selector. |
| `/language zh\|en` | Switch TUI language. Chinese is the default. |
| `/shell on\|off` | Toggle shell for the current session. |
| `/browser on\|off` | Toggle browser/CDP bridge. |
| `/cache` | Inspect cache readiness and prompt shape. |
| `/usage` `/cost` | Show tokens and estimated cost. |
| `/runs` `/trace` `/events` | Inspect persisted runs, actions, tasks, and events. |
| `/ask <question>` | Ask a read-only side question during a long task. |
| `/remote-control` | Start or stop WeCom / personal WeChat remote control. |
| `/skills` `/plugins` `/mcp` | Manage extension surfaces. |

See [CLI Reference](./CLI_REFERENCE.md) for the full list.

## WeChat Remote Control

DeepSeekCode keeps two remote channels:

- WeCom: based on `@wecom/aibot-node-sdk`.
- Personal WeChat OpenClaw: based on Tencent `@tencent-weixin/openclaw-weixin@2.4.4`.

Recommended flow: start the desktop TUI in a project directory, then bind WeChat with `/remote-control`. The computer continues running; WeChat sends tasks, receives concise progress, handles approvals, and receives final summaries/previews.

```text
/remote-control
/remote-control wechat login
/remote-control wechat start
/remote-control wecom start
```

Pure remote mode:

```cmd
deepseekcode --wechat-login --project "D:\code\DeepSeekTest"
deepseekcode --wechat --project "D:\code\DeepSeekTest" --model deepseek-v4-flash
deepseekcode --wecom --project "D:\code\DeepSeekTest" --model deepseek-v4-flash
```

Remote commands:

```text
/help
/status
/status full
/ask where is the task blocked?
/project
/project D:\code\DeepSeekTest
/run continue this website and send a preview
/continue
/stop
/artifacts
/usage
/shell on
/shell off
```

Normal greetings are answered as chat. Task requests enter the local agent runtime. During an active long task, `/ask` is read-only and does not write files, run shell, or pollute the main task.

Personal WeChat has no WeCom-style template cards, so permission approval uses numeric replies:

```text
1 allow once
2 allow for this session
3 reject
4 stop task
```

Personal WeChat support is experimental. It depends on OpenClaw QR login, long polling, phone plugin state, and network stability. Personal WeChat PC hooks, reverse-protocol clients, and wxauto are reserved and not part of the default build.

## Artifact Delivery

Remote artifact delivery is planned by the runtime from real files and manifests, not prompt keywords.

| Artifact | WeChat delivery behavior |
| --- | --- |
| `.html` / `.htm` | Prefer a browser screenshot image, plus a short entry-file summary. Do not flood WeChat with HTML/CSS/JS. |
| `.docx` / `.pptx` / `.xlsx` | Send the original file. Future LibreOffice integration can add PDF or first-page previews. |
| `.pdf` | Send the PDF. Future work can add first-page image previews. |
| `.png` / `.jpg` / `.webp` | Send as image. |
| `.md` / `.txt` | Send a concise chat summary; send the file only when requested. |
| Multi-file project | Send final summary, entry file, screenshot, and manifest instead of every source file. |

The model may suggest important artifacts, but `RemoteDeliveryPlan` decides what is safe and readable based on file type, size, project bounds, and WeChat usability.

## Skills, Plugins, And MCP

DeepSeekCode supports `.deepseekcode` skills and `.claude`-style `SKILL.md` compatibility. Installed copies are written to `.deepseekcode`.

```text
/skills install "D:\skills\office-report"
/skills install https://github.com/example/agent-skills/tree/main/office/report
/skills install file:///D:/repos/agent-skills.git#main:office/report
/skills install greensock/gsap-skills
/skills install-all greensock/gsap-skills
/skills search gsap
/skills validate
/skills run gsap-core "add production-grade animation to this page"
```

Automatic invocation:

- `search_skills` and `invoke_skill` are native tools.
- The model searches and invokes skills from task semantics; users do not need to explicitly say "use this skill" every time.
- Clear `description` fields make auto-invocation more reliable.
- Skills marked `disable-model-invocation: true` are excluded from automatic candidates but remain manually runnable.

Plugins support local paths, GitHub URLs, Git URLs, and `file://` Git sources. MCP is currently exposed through a unified `mcp_call` entry; direct per-tool native schema expansion is still in progress.

## Multi-Agent And Side Questions

Multi-agent workflow is experimental but testable. The main model can start role-based work with native tools:

- `start_agent_workflow`
- `send_agent_message`
- `agent_status`
- `finish_agent_workflow`

Users can say "start multi-agent collaboration; let frontend, tester, and reviewer work together." If roles are not specified, the main model designs project-specific roles and adds a Reviewer/acceptance role by default. The runtime uses Supervisor + Shared Blackboard so role messages and acceptance findings are tracked without leaking into unrelated projects.

`/ask <question>` is a read-only side-channel during long tasks. It reads the current run, recent events, tasks, usage, and artifacts. It does not write files, run shell, or use browser/MCP write operations.

## Memory, Context, And Cache

DeepSeekCode vendors the MIT runtime from [TencentDB-Agent-Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory):

- Recall long-term memory before provider calls.
- Capture successful turns and extract L1/L2/L3 memory.
- Local SQLite is the default store.
- TCVDB/embedding are optional and are not advertised as full vector memory unless configured.

Context layers:

- Stable runtime prompt and tool definitions first for DeepSeek prefix cache reuse.
- Recent high-value turns.
- Rolling summary for old goals, constraints, paths, failures, and remaining work.
- Tool-result micro-summaries so long stdout, diffs, and logs are not repeatedly injected.
- Runtime run state with tasks, artifacts, gates, checkpoints, and usage.

Useful commands:

```text
/memory status
/memory search language preference
/memory conversation "continue dashboard"
/cache
/usage
/cost
```

## Capability Matrix

| Capability | Status | Notes |
| --- | --- | --- |
| DeepSeek native tool calls | Verified | Local work requires native tool calls; unsupported gateways fail clearly. |
| File tools | Verified | `read_file`, `write_file`, `append_file`, `apply_patch`, `list_files`, `grep_files`, `glob_files`. |
| Shell tools | Permissioned | Off by default; approved through TUI/WeChat/WeCom gates. |
| Browser CDP | Partial | Browser actions and screenshots are connected; real UI QA still needs hardening. |
| DOCX/PPTX | Partial | Real files can be generated; layout, charts, and visual QA continue to improve. |
| PDF | Experimental | `create_pdf` remains experimental. |
| TencentDB-Agent-Memory | Verified | Local SQLite memory and recall are connected; vector quality depends on configuration. |
| Skills/plugins | Verified | Install, search, validate, invoke, and auto-candidate injection are connected. |
| MCP | Partial | Unified `mcp_call` is connected; per-tool schema expansion is still in progress. |
| Hooks | Verified | PreToolUse/PostToolUse wrap local tool execution. |
| WeCom remote | Experimental / testable | Text tasks, concise progress, approvals, artifact summaries. |
| Personal WeChat OpenClaw | Experimental / testable | QR login, long polling, text tasks, numeric approvals, artifact summaries. |
| Multi-agent workflow | Experimental / testable | Role specs, blackboard, reviewer, and checkpoint state are connected; visual dashboard is still pending. |
| `/ask` side questions | Verified | Read-only answers during active runs. |
| Long-task worker pool | Partial | Runs/tasks/checkpoints/resume/cancel exist; full worker pool continues to evolve. |
| `computer_use` | Reserved | Not documented as complete until a real GUI bridge exists. |
| Personal WeChat hook | Reserved | Not part of the default build. |

## Real Scenario Testing

Keep test outputs in an external project directory such as `D:\code\DeepSeekTest`.

Recommended scenarios:

- Large website project with multi-turn continuation.
- Defense PPT, course PPT, and OFDR principle PPT.
- DOCX project report.
- Deliberate failure followed by self-repair.
- Planner/Builder/Tester/Reviewer multi-agent project.
- WeChat remote task, progress, shell approval, and artifact summary.
- GSAP skill install, search, automatic invocation, and artifact validation.
- MCP mock stdio/http call and permission failure recovery.

Base checks:

```cmd
npm.cmd run typecheck
npm.cmd run build
npm.cmd pack --dry-run
```

Report command:

```text
/runs report latest "D:\code\DeepSeekTest"
```

## Still In Progress

v0.2.8 is a release-quality documentation and website refresh, not a claim that all planned capabilities are finished. Still in progress:

- WeChat QR/browser-login stability and OpenClaw network recovery.
- Full desktop TUI and WeChat event mirroring.
- Multi-agent visual dashboard or side window.
- Higher-quality preview images for web, document, and PDF outputs.
- Real MCP service scenario coverage.
- Better long-task diagnostics for model wait, tool wait, stuck state, and next action.
- Office/PPT templates, charts, images, and render checks.

## Architecture, Development, And Release

- [Architecture](./ARCHITECTURE.md)
- [Development Guide](./DEVELOPMENT.md)
- [API Reference](./API_REFERENCE.md)
- [CLI Reference](./CLI_REFERENCE.md)
- [Guide](./GUIDE.md)

The release tree contains runtime source, public assets, website, README files, and user manuals. Test directories, prompt audits, runtime databases, login state, generated reports, and temporary npm tarballs are not published to GitHub.

## License

MIT
