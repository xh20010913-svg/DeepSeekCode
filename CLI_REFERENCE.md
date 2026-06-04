# DeepSeekCode CLI Reference

## Package Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Run the TypeScript CLI with `tsx`. |
| `npm run start` | Run the compiled CLI from `dist/`. |
| `npm run typecheck` | Type-check without emitting files. |
| `npm run build` | Compile TypeScript. |
| `npm run doctor` | Run compiled diagnostics. |

## CLI Flags

```text
deepseekcode [options]
```

Installed commands:

- `deepseekcode`: primary command, similar to running Claude Code from a project directory.

If `--project` is omitted, DeepSeekCode uses the current directory. If `--data-dir` is omitted, runtime state is written to `<project>/.deepseekcode`.

Windows note: npm creates both PowerShell and cmd shims. If PowerShell blocks `deepseekcode.ps1` because script execution is disabled, use `deepseekcode.cmd`; cmd can run `deepseekcode` directly.

| Flag | Description |
| --- | --- |
| `--project <path>` | Workspace root for local tools. |
| `--data-dir <path>` | Runtime data directory. |
| `--model <model>` | Model or provider profile. |
| `-p, --prompt <text>` | Run one headless prompt. |
| `-c, --continue` | Continue the latest transcript session. |
| `--resume <session-id>` | Resume a specific transcript session. |
| `--doctor` | Print diagnostics. |
| `--verify-model` | Verify model access. |
| `--wecom` | Start Enterprise WeChat / WeCom remote control without opening the TUI. |
| `--wechat` | Start personal WeChat OpenClaw remote control without opening the TUI. |
| `--wechat-login` | Scan and store personal WeChat OpenClaw login. |
| `--allow-shell` | Enable shell tools. |
| `--allow-browser` | Enable browser tools. |
| `--permission-profile <profile>` | `safe`, `dev`, `browser`, or `open`. |
| `--json` | Emit headless events as JSON lines. |

Examples:

```bash
npm install -g @xh12312/deepseekcode
cd D:\work\agent-test
deepseekcode
deepseekcode --permission-profile dev
deepseekcode --continue -p "Continue the previous task"
deepseekcode --resume session_xxx -p "Continue"
deepseekcode --prompt "Summarize this repository" --json
deepseekcode --wecom --project "D:\work\agent-test" --model deepseek-v4-flash
deepseekcode --wechat-login --project "D:\work\agent-test"
deepseekcode --wechat --project "D:\work\agent-test" --model deepseek-v4-flash

# If a mirror has not synced the scoped package yet:
npm install -g @xh12312/deepseekcode --registry https://registry.npmjs.org/

# Source checkout only:
npm run start -- --project "D:\work\agent-test"
```

GitHub network install is also supported for testing the current `main` branch:

```bash
npm install -g github:xh20010913-svg/DeepSeekCode
```

## Environment

| Variable | Purpose |
| --- | --- |
| `DEEPSEEK_BASE_URL` | DeepSeek-compatible base URL. |
| `DEEPSEEK_API_KEY` | Provider API key. |
| `DEEPSEEK_MODEL` | Default model. |
| `DEEPSEEK_TIMEOUT_SECS` | Provider timeout. |
| `DEEPSEEKCODE_LANGUAGE` / `DEEPSEEKCODE_LANG` | `zh-CN` or `en`. |
| `DEEPSEEKCODE_HOME` | Runtime data directory. |
| `DEEPSEEKCODE_STARTUP_SHELL_PROMPT` | Set `0` to skip the startup shell permission prompt. |
| `DEEPSEEKCODE_PROVIDER_CONFIG` | Provider profile JSON. |
| `DEEPSEEKCODE_PERMISSION_PROFILE` | Default permission profile. |
| `DEEPSEEKCODE_PROMPT_AUDIT_DIR` | Enable debug prompt audit output. |
| `DEEPSEEKCODE_BROWSER_CDP_URL` | Browser CDP endpoint. |
| `DEEPSEEKCODE_TDAI_MEMORY` | `on` by default. Set `off` to disable TencentDB-Agent-Memory. |
| `DEEPSEEKCODE_TDAI_CAPTURE` | Capture successful user/assistant turns into TDAI L0 conversation memory. |
| `DEEPSEEKCODE_TDAI_RECALL` | Recall long-term memory before prompt construction. |
| `DEEPSEEKCODE_TDAI_EXTRACTION` | Let TDAI extract L1/L2/L3 memory with the configured provider. |
| `DEEPSEEKCODE_TDAI_STORE` | `sqlite` by default, or `tcvdb` when Tencent Cloud VectorDB is configured. |
| `DEEPSEEKCODE_TDAI_EMBEDDING_PROVIDER` | Optional embedding provider. `none` keeps vector recall disabled. |
| `DEEPSEEKCODE_TCVDB_URL` | Optional Tencent Cloud VectorDB endpoint. |
| `DEEPSEEKCODE_TCVDB_API_KEY` | Optional Tencent Cloud VectorDB API key. |
| `DEEPSEEKCODE_WECOM_BOT_ID` | Enterprise WeChat intelligent bot ID. |
| `DEEPSEEKCODE_WECOM_BOT_SECRET` | Enterprise WeChat intelligent bot secret. |
| `DEEPSEEKCODE_WECOM_WS_URL` | Optional WebSocket URL; defaults to WeCom's official openws endpoint. |
| `DEEPSEEKCODE_WECOM_ALLOWED_USERS` | Optional WeCom userid allowlist. |
| `DEEPSEEKCODE_WECOM_ALLOWED_GROUPS` | Optional WeCom group chatid allowlist. |
| `DEEPSEEKCODE_WECOM_PROJECT_ROOTS` | Optional allowed project roots for remote `/project <path>`. |
| `DEEPSEEKCODE_WECOM_MENTION_NAMES` | Optional bot mention aliases for group chats. |
| `DEEPSEEKCODE_WECHAT_OPENCLAW_ENABLED` | Enable the experimental personal WeChat OpenClaw channel. |
| `DEEPSEEKCODE_WECHAT_ACCOUNT_ID` | Optional stored OpenClaw account id to use. |
| `DEEPSEEKCODE_WECHAT_ALLOWED_USERS` | Optional personal WeChat user allowlist. |
| `DEEPSEEKCODE_WECHAT_ALLOWED_GROUPS` | Optional personal WeChat group allowlist. |
| `DEEPSEEKCODE_WECHAT_PROJECT_ROOTS` | Optional allowed project roots for remote `/project <path>`. |
| `DEEPSEEKCODE_WECHAT_MENTION_NAMES` | Bot mention aliases for personal WeChat group chats. |
| `DEEPSEEKCODE_WECHAT_QR_POLL_INTERVAL_MS` | QR login polling cadence hint. |
| `DEEPSEEKCODE_WECHAT_LONG_POLL_TIMEOUT_MS` | OpenClaw getupdates long-poll timeout. |
| `DEEPSEEKCODE_PRICE_INPUT_PER_M` | Input-token price override. |
| `DEEPSEEKCODE_PRICE_OUTPUT_PER_M` | Output-token price override. |
| `DEEPSEEKCODE_PRICE_CACHE_HIT_PER_M` | Cache-hit token price override. |
| `DEEPSEEKCODE_PRICE_CACHE_MISS_PER_M` | Cache-miss token price override. |

## Slash Commands

| Command | Purpose |
| --- | --- |
| `/help` | Show command help. |
| `/doctor` | Provider, native tool, skills/plugins, cache, and permission diagnostics. |
| `/version` | Show version information. |
| `/model` | Open model picker. |
| `/model flash` `/model pro` | Switch model. |
| `/language zh` `/language en` | Switch TUI language. |
| `/settings` | Runtime settings overview. |
| `/config` | Runtime config view. |
| `/status` | Current runtime status. |
| `/ask <question>` | Ask a read-only side-channel question while a long task keeps running. |
| `/project` | Project scope. |
| `/permissions` | Permission profile and gates. |
| `/shell on|off` | Toggle shell tools. |
| `/browser on|off` | Toggle browser tools. |
| `/tools` | Real tool registry and capability status. |
| `/cmd <command>` | Run a shell command when allowed. |
| `/runs` | List durable runs. |
| `/runs report latest <dir>` | Export scenario report Markdown/JSON. |
| `/trace <run>` | Run trace. |
| `/events [current|all]` | Runtime events. |
| `/queue` | Runnable task queue. |
| `/pause` `/run-resume` `/cancel` | Durable run controls. |
| `/sessions` | Saved transcript sessions. |
| `/resume <session-id>|current|clear` | Manage focused transcript session. |
| `/cache` | Cache telemetry and readiness. |
| `/cache guard <goal>` | Forecast cache stability. |
| `/cache prepare <goal>` | Prepare reusable context. |
| `/usage` `/cost` | Token and cost summaries. |
| `/skills` | Skill discovery, install, update, validate, uninstall, run. |
| `/plugins` | Plugin discovery, install, update, validate, enable/disable, uninstall. |
| `/hooks` | Hook configuration. |
| `/mcp` | MCP configuration and status. |
| `/multi provider <task>` | Planner/Builder/Tester/Reviewer workflow. |
| `/todo` `/todos` | Structured todo state. |
| `/approval` `/validation` | Gate status and decisions. |
| `/remote-control` | Inspect, start, or stop WeCom / personal WeChat remote control. |
| `/remote-control wecom start|stop` | Manage Enterprise WeChat remote control. |
| `/remote-control wechat login|start|stop` | Manage personal WeChat OpenClaw remote control. |
| `/review` `/security-review` | Review current diff or files. |
| `/diff` | Show project diff. |
| `/files` `/context` | Inspect selected context. |
| `/memory` | Show project memory. |
| `/memory add <text>` | Append project-local memory. |
| `/memory path` | Print the project memory path. |
| `/memory status` | Show TencentDB-Agent-Memory status, storage backend, recall/capture/extraction flags, and registered memory tools. |
| `/memory search <query>` | Search TDAI L1 structured memories. |
| `/memory conversation <query>` | Search TDAI L0 raw conversation history. |
| `/clear` `/quit` | Clear UI or exit. |

Use `/help` in the TUI for the exact command catalog.

## Remote Commands

WeCom and personal WeChat use the same project runtime as the TUI. Remote commands are intentionally concise so a phone chat does not turn into a terminal transcript.

| Command | Purpose |
| --- | --- |
| `/help` | Show remote command help. |
| `/status` | Show a concise run snapshot. |
| `/status full` | Show recent events, waiting gates, artifacts, and likely blockers. |
| `/project` | Show the bound project. |
| `/project <path>` | Switch to an allowed project root. |
| `/run <task>` | Start a new task in the bound project. |
| `/continue` | Continue the latest paused task. |
| `/ask <question>` | Ask a read-only question without interrupting the active run. |
| `/artifacts` | Show artifact summary and delivery status. |
| `/usage` | Show run/session usage summary. |
| `/agents` | Show multi-agent workflow status when one is active. |
| `/stop` | Stop the active remote run. |

Personal WeChat approvals use numeric replies because personal WeChat does not provide WeCom-style template cards: `1` allows once, `2` allows for the session, `3` rejects, and `4` stops the task.

## Multi-Agent Workflow Tools

The user can still call `/multi provider <task>` for the legacy provider workflow, but v0.2.7 also exposes native workflow tools to the model so natural language can start coordinated roles:

| Tool | Purpose |
| --- | --- |
| `start_agent_workflow` | Create a supervisor-managed workflow from user-defined or model-designed roles. |
| `send_agent_message` | Record a role-to-role message on the shared blackboard. |
| `agent_status` | Summarize roles, messages, artifacts, open questions, and reviewer state. |
| `finish_agent_workflow` | Close the workflow with a final acceptance or failure summary. |

The runtime automatically expects a reviewer-style role when the task needs validation. Child roles keep their own compact transcript summaries; the main session receives role summaries, artifacts, issues, and the reviewer conclusion instead of every raw turn.

## Permission Profiles

| Profile | Shell | Browser |
| --- | --- | --- |
| `safe` | off | off |
| `dev` | on | off |
| `browser` | off | on |
| `open` | on | on |

When the TUI starts with shell disabled, it asks whether to enable shell for the current session. Use Up/Down to select, Enter to confirm, and Esc/N to keep shell off. This is a runtime permission choice, not a keyword classifier on the user's task. Later `run_command` tool calls still pass through permission gates.

## Tool Status

Use `/tools` for the exact runtime registry. Status meanings:

- `supported`: fully wired to local execution.
- `partial`: usable through a narrower integration boundary.
- `experimental`: available but quality or scope is limited.
- `reserved`: schema placeholder for a planned bridge; not a full capability.

TencentDB-Agent-Memory adds two read-only native tools when the memory service is attached to a run:

- `tdai_memory_search`: searches structured L1 memories such as durable preferences, decisions, instructions, and project facts.
- `tdai_conversation_search`: searches raw L0 conversation history when exact older wording matters.

The memory runtime stores data under `<data-dir>/tdai/`. With local SQLite only, it supports capture and text/BM25-style search. Semantic vector recall and Tencent Cloud VectorDB are enabled only when the corresponding embedding/TCVDB settings are present.

## Diagnostics And Reports

```bash
npm run typecheck
npm run build
deepseekcode --doctor
```

```text
/doctor
/runs report latest "D:\work\agent-test"
```

