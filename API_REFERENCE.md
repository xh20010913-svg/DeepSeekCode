# DeepSeekCode API Reference

This document describes public commands, runtime interfaces, and integration surfaces in the release build.

## CLI

```cmd
deepseekcode [options]
```

| Option | Description |
| --- | --- |
| `--project <path>` | Project root. Defaults to the current directory. |
| `--data-dir <path>` | Runtime data directory. Defaults to `<project>\.deepseekcode`. |
| `--model <name>` | Model name, for example `deepseek-v4-flash` or `deepseek-v4-pro`. |
| `--continue` | Continue the current session context. |
| `--resume <session>` | Resume a saved session id. |
| `--doctor` | Print provider, tools, memory, remote, and permission diagnostics. |
| `--allow-shell` | Enable shell for this process. Tool gates still apply. |
| `--allow-browser` | Enable browser/CDP bridge for this process. |
| `--permission-profile <name>` | `safe`, `dev`, `browser`, or `open`. |
| `--wecom` | Start Enterprise WeChat remote control without opening the TUI. |
| `--wechat-login` | Login personal WeChat OpenClaw account. |
| `--wechat` | Start personal WeChat OpenClaw remote control without opening the TUI. |
| `-p, --prompt <text>` | Run one prompt and exit. |

Examples:

```cmd
deepseekcode
deepseekcode --project D:\code\DeepSeekTest
deepseekcode --project D:\code\DeepSeekTest --model deepseek-v4-flash
deepseekcode --wechat --project D:\code\DeepSeekTest
```

## Slash Commands

| Command | Description |
| --- | --- |
| `/help` | Show command help. |
| `/doctor` | Diagnose provider, tools, memory, remote, and permission configuration. |
| `/status` | Show runtime status. |
| `/status full` | Show detailed run/remote/task status where supported. |
| `/ask <question>` | Read-only side-channel answer using the current project/run state. |
| `/tools` | List registered local tools and support status. |
| `/model` | Open model selector. |
| `/model flash` | Switch to configured flash model. |
| `/model pro` | Switch to configured pro model. |
| `/language zh` / `/language en` | Switch TUI language. |
| `/permissions` | Inspect runtime permission profile. |
| `/shell on\|off` | Toggle shell for current process/session. |
| `/browser on\|off` | Toggle browser bridge for current process/session. |
| `/skills ...` | List, search, install, validate, update, uninstall, and run skills. |
| `/plugins ...` | Manage local plugin bundles. |
| `/mcp ...` | Configure and call MCP servers. |
| `/agents ...` | Manage reusable agent definitions and workflow status. |
| `/multi provider <task>` | Run Planner/Builder/Tester/Reviewer style flow. |
| `/runs` | List persisted runs. |
| `/trace <run>` | Show action and artifact trace. |
| `/events <run>` | Show event log. |
| `/artifacts` | Show recent artifacts. |
| `/usage` / `/cost` | Show token and estimated cost usage. |
| `/remote-control ...` | Start/stop/status WeCom and personal WeChat remote channels. |
| `/stop` | Stop current run when supported by the surface. |

## Remote Commands

Remote commands work in WeCom and personal WeChat unless noted.

```text
/help
/status
/status full
/ask <question>
/project
/project <path>
/run <task>
/continue
/stop
/artifacts
/usage
/shell on
/shell off
```

Natural language can start a task when there is no active run. If a run is active, task-like messages return current status and instructions. Use `/ask` for read-only questions while the active task continues.

## Remote Permission Decisions

Personal WeChat OpenClaw numeric decisions:

| Reply | Meaning |
| --- | --- |
| `1` | Allow once. |
| `2` | Allow for this remote session. |
| `3` | Reject. |
| `4` | Stop current task. |

WeCom uses template cards where the SDK/channel supports them.

## Native Workflow Tools

The provider receives registered local tools as DeepSeek-compatible function calling tools.

| Tool group | Examples |
| --- | --- |
| File tools | `read_file`, `write_file`, `append_file`, `apply_patch`, `list_files`, `grep_files`, `glob_files` |
| Shell/browser | `run_command`, `browser_session_start`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_screenshot` |
| Office/artifacts | `create_docx`, `create_pptx`, `create_pdf`, `validate_artifact` |
| Skills | `search_skills`, `invoke_skill` |
| MCP | `mcp_call` |
| Memory | `tdai_memory_search`, `tdai_conversation_search` |
| Multi-agent workflow | `start_agent_workflow`, `send_agent_message`, `agent_status`, `finish_agent_workflow` |

Reserved or experimental tools may appear with status metadata but should not be documented as complete until verified.

## Multi-Agent Workflow

### `start_agent_workflow`

Starts a tracked workflow for the current run.

Fields:

| Field | Type | Description |
| --- | --- | --- |
| `goal` | string | User-visible workflow goal. |
| `roles` | array | Optional role specs. If omitted, the model designs roles. |
| `mode` | string | Optional orchestration mode, currently supervisor-style. |
| `notes` | string | Optional context. |

Role spec example:

```json
{
  "name": "frontend",
  "responsibility": "Build the UI",
  "tools": ["read_file", "write_file", "browser_screenshot"],
  "skills": ["gsap-core", "ui"],
  "acceptance": ["HTML entry exists", "browser screenshot renders"],
  "notes": "Use current project conventions"
}
```

### `send_agent_message`

Adds a blackboard message between roles.

Fields: `workflow_id`, `from`, `to`, `message`, `kind`.

### `agent_status`

Returns workflow status, role specs, todo counts, issues, and recent messages.

Fields: `workflow_id` optional.

### `finish_agent_workflow`

Marks workflow succeeded, failed, or cancelled and records summary, artifacts, and issues.

Fields: `workflow_id`, `status`, `summary`, `artifacts`, `issues`.

## Async Question Interface

`/ask` uses a read-only side-channel.

Inputs:

- question;
- runtime config;
- state store;
- provider;
- optional run id.

Allowed context:

- latest run status;
- recent events;
- task list;
- usage totals;
- trace artifacts;
- bounded file snippets if required.

The service must not call local write tools, shell, browser, or MCP write operations. It may record usage and a side-answer event.

## Run Event Bus

`RunEventBus` publishes every persisted `StateStore.appendEvent()` call.

```ts
interface RunEventBusEvent {
  runId: string | null;
  projectPath?: string;
  kind: string;
  payload: unknown;
  createdAtMs: number;
}
```

Subscribers can filter by run or project. Subscriber errors are swallowed so they cannot break persistence.

## Session Hub

`SessionHub` tracks:

- latest run per project;
- last event kind and timestamp;
- remote channel status per project;
- active remote account/channel metadata.

It is the convergence point for desktop TUI, WeCom, and personal WeChat status surfaces.

## Remote Delivery Plan

`planRemoteDelivery()` classifies real artifact files by extension and metadata.

| Type | Preview | File send |
| --- | --- | --- |
| image | send image | send image |
| html | render screenshot when available | do not send raw HTML automatically |
| office | optional preview future work | send DOCX/PPTX/XLSX |
| pdf | optional page preview future work | send PDF |
| text/markdown | chat summary | file only on request |
| code | summary/manifest | do not send every file |
| archive | no preview | send only if within size limit |

## Skill Interfaces

Skill discovery reads `SKILL.md` files from built-in, project, user, plugin cache, and compatibility `.claude` paths.

Commands:

```text
/skills list
/skills search <query>
/skills install <source> [name]
/skills install-all <source>
/skills update <name>
/skills validate [name]
/skills uninstall <name>
/skills run <name> <task>
```

Native tools:

- `search_skills`: find relevant installed skills by semantic text and metadata.
- `invoke_skill`: run a selected skill in a bounded forked context.

`disable-model-invocation: true` removes a skill from automatic candidates but keeps manual commands available.

## MCP Interface

MCP is exposed through `mcp_call`:

```json
{
  "server": "local-docs",
  "tool": "search",
  "arguments": {
    "query": "cache policy"
  }
}
```

MCP tool results must be summarized before prompt replay. Permissioned MCP operations must pass through the same approval service as local tools.

## Environment Variables

Provider:

```text
DEEPSEEK_BASE_URL
DEEPSEEK_API_KEY
DEEPSEEK_MODEL
DEEPSEEK_TIMEOUT_SECS
```

Remote:

```text
DEEPSEEKCODE_WECOM_BOT_ID
DEEPSEEKCODE_WECOM_BOT_SECRET
DEEPSEEKCODE_WECOM_ALLOWED_USERS
DEEPSEEKCODE_WECOM_ALLOWED_GROUPS
DEEPSEEKCODE_WECOM_PROJECT_ROOTS
DEEPSEEKCODE_WECHAT_OPENCLAW_ENABLED
DEEPSEEKCODE_WECHAT_ACCOUNT_ID
DEEPSEEKCODE_WECHAT_ALLOWED_USERS
DEEPSEEKCODE_WECHAT_ALLOWED_GROUPS
DEEPSEEKCODE_WECHAT_PROJECT_ROOTS
DEEPSEEKCODE_WECHAT_MENTION_NAMES
DEEPSEEKCODE_WECHAT_QR_POLL_INTERVAL_MS
DEEPSEEKCODE_WECHAT_LONG_POLL_TIMEOUT_MS
```

Debug, memory, and cost:

```text
DEEPSEEKCODE_PROMPT_AUDIT_DIR
DEEPSEEKCODE_TDAI_MEMORY
DEEPSEEKCODE_TDAI_CAPTURE
DEEPSEEKCODE_TDAI_RECALL
DEEPSEEKCODE_TDAI_EXTRACTION
DEEPSEEKCODE_TDAI_STORE
DEEPSEEKCODE_PRICE_INPUT_PER_M
DEEPSEEKCODE_PRICE_OUTPUT_PER_M
DEEPSEEKCODE_PRICE_CACHE_HIT_PER_M
DEEPSEEKCODE_PRICE_CACHE_MISS_PER_M
```
