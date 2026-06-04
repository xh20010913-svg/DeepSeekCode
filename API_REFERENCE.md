# DeepSeekCode API Reference

This reference documents the public command and runtime interfaces exposed by the release build.

## CLI

```bash
deepseekcode [options]
```

Common options:

| Option | Description |
| --- | --- |
| `--project <path>` | Project root. Defaults to the current directory. |
| `--data-dir <path>` | Runtime data directory. Defaults to `<project>\.deepseekcode`. |
| `--model <name>` | Model name, for example `deepseek-v4-flash` or `deepseek-v4-pro`. |
| `--continue` | Continue the current session context. |
| `--resume <session>` | Resume a saved session id. |
| `--doctor` | Print configuration and capability diagnostics. |
| `--allow-shell` | Enable shell for this process. Tool permissions still apply. |
| `--allow-browser` | Enable browser bridge for this process. |
| `--permission-profile <name>` | `safe`, `dev`, `browser`, or `open`. |
| `--wecom` | Start Enterprise WeChat remote control without opening the TUI. |
| `--wechat-login` | Login personal WeChat OpenClaw account. |
| `--wechat` | Start personal WeChat OpenClaw remote control without opening the TUI. |
| `-p, --prompt <text>` | Run one prompt and exit. |

Examples:

```bash
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
| `/status` | Show TUI runtime status. |
| `/ask <question>` | Read-only side-channel answer using the current run/project state. |
| `/tools` | List registered local tools and support status. |
| `/model` | Open model selector. |
| `/model flash` | Switch to configured flash model. |
| `/model pro` | Switch to configured pro model. |
| `/language zh` / `/language en` | Switch TUI language. |
| `/permissions` | Inspect runtime permission profile. |
| `/shell on|off` | Toggle shell for current process/session. |
| `/browser on|off` | Toggle browser bridge for current process/session. |
| `/skills ...` | List, search, install, validate, update, uninstall, and invoke skills. |
| `/plugins ...` | Manage local plugin bundles. |
| `/mcp ...` | Configure and call MCP servers. |
| `/agents ...` | Manage reusable agent definitions and legacy agent runs. |
| `/multi provider <task>` | Run the Planner/Builder/Tester/Reviewer flow. |
| `/runs` | List persisted runs. |
| `/trace <run>` | Show action and artifact trace. |
| `/events <run>` | Show event log. |
| `/artifacts` | Show recent artifacts. |
| `/usage` / `/cost` | Show token and estimated cost usage. |
| `/remote-control ...` | Start/stop/status WeCom and WeChat remote channels. |
| `/stop` | Stop current run when supported by the current surface. |

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

Natural-language messages are treated as normal tasks when there is no active run. If a run is active, normal messages return status and instructions. Use `/ask` for read-only side questions while the active task continues.

## Remote Permission Decisions

Personal WeChat OpenClaw uses numeric decisions:

| Reply | Meaning |
| --- | --- |
| `1` | Allow once. |
| `2` | Allow for this remote session. |
| `3` | Reject. |
| `4` | Stop current task. |

WeCom uses template cards where supported.

## Native Workflow Tools

The provider sees registered local tools as native function calling tools. Important tool groups:

| Tool group | Examples |
| --- | --- |
| File tools | `read_file`, `write_file`, `append_file`, `apply_patch`, `list_files`, `grep_files`, `glob_files` |
| Shell/browser | `run_command`, `browser_session_start`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_screenshot` |
| Office/artifacts | `create_docx`, `create_pptx`, `create_pdf`, `validate_artifact` |
| Skills | `invoke_skill` |
| MCP | `mcp_call` |
| Memory | `tdai_memory_search`, `tdai_conversation_search` |
| Multi-agent workflow | `start_agent_workflow`, `send_agent_message`, `agent_status`, `finish_agent_workflow` |

Reserved or experimental tools may appear with status metadata but should not be documented as complete unless verified.

## Multi-Agent Workflow Tool Interfaces

### `start_agent_workflow`

Starts a tracked workflow for the current run.

Fields:

| Field | Type | Description |
| --- | --- | --- |
| `goal` | string | User-visible workflow goal. |
| `roles` | array | Optional role specs. If omitted, the model designs roles. |
| `mode` | string | Optional orchestration mode, currently supervisor-style. |
| `notes` | string | Optional context. |

Each role can include:

```json
{
  "name": "frontend",
  "responsibility": "Build the UI",
  "tools": ["read_file", "write_file", "browser_screenshot"],
  "skills": ["ui"],
  "acceptance": ["HTML entry exists", "browser screenshot renders"],
  "notes": "Use current project conventions"
}
```

### `send_agent_message`

Adds a blackboard message between roles.

Fields: `workflow_id`, `from`, `to`, `message`, `kind`.

### `agent_status`

Returns workflow status and recent messages.

Fields: `workflow_id` optional.

### `finish_agent_workflow`

Marks workflow succeeded, failed, or cancelled and records artifacts/issues.

Fields: `workflow_id`, `status`, `summary`, `artifacts`, `issues`.

## Async Question Interface

`/ask` uses `answerAsyncQuestion()` internally.

Inputs:

- question
- runtime config
- StateStore
- provider
- optional run id

The service reads:

- latest run status
- recent events
- task list
- usage totals
- trace artifacts

It must not call local tools or mutate files. It may record usage and an event indicating that a side answer was produced.

## Run Event Bus

`RunEventBus` publishes every `StateStore.appendEvent()` call.

Event shape:

```ts
interface RunEventBusEvent {
  runId: string | null;
  projectPath?: string;
  kind: string;
  payload: unknown;
  createdAtMs: number;
}
```

Subscribers can filter by `runId` or `projectPath`. Subscriber errors are swallowed so they cannot break persistence.

## Session Hub

`SessionHub` tracks:

- latest run per project;
- last event kind and timestamp;
- remote channel status per project.

It is the future convergence point for desktop TUI, WeCom, and personal WeChat surfaces.

## Artifact Delivery Plan

`planRemoteDelivery()` classifies real artifact files by extension and metadata.

| Type | Preview | File send |
| --- | --- | --- |
| image | send image | send image |
| html | render screenshot | do not send raw HTML automatically |
| office | optional preview future work | send file |
| pdf | optional page preview future work | send file |
| text/markdown | chat summary | do not send automatically |
| code | summary/manifest | do not send automatically |
| archive | no preview | send if within size limit |

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
```

Debug and cache:

```text
DEEPSEEKCODE_PROMPT_AUDIT_DIR
DEEPSEEKCODE_TDAI_MEMORY
DEEPSEEKCODE_PRICE_INPUT_PER_M
DEEPSEEKCODE_PRICE_OUTPUT_PER_M
DEEPSEEKCODE_PRICE_CACHE_HIT_PER_M
DEEPSEEKCODE_PRICE_CACHE_MISS_PER_M
```
