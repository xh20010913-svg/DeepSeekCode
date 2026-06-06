# DeepSeekCode API Reference

Version: `v0.3.0`

This reference covers the public CLI, slash commands, remote commands, tools, and extension surfaces that are stable enough to document.

## CLI

```cmd
deepseekcode [options]
```

| Option | Type | Meaning |
| --- | --- | --- |
| `--project` | path | Project root. Defaults to the current directory. |
| `--data-dir` | path | Runtime data directory. Defaults to `<project>\.deepseekcode`. |
| `--model` | string | Provider model, for example `deepseek-v4-flash` or `deepseek-v4-pro`. |
| `--continue` | flag | Continue the latest session for the project. |
| `--resume` | session id | Resume a known session. |
| `--doctor` | flag | Print diagnostics and exit. |
| `--allow-shell` | flag | Enable shell tools for this process. Commands still pass through permission policy. |
| `--allow-browser` | flag | Enable browser/CDP tools for this process. |
| `--permission-profile` | string | Permission profile such as `safe`, `dev`, `browser`, or `open`. |
| `--wecom` | flag | Start WeCom remote mode. |
| `--wechat-login` | flag | Login personal WeChat OpenClaw. |
| `--wechat` | flag | Start personal WeChat OpenClaw remote mode. |
| `-p`, `--prompt` | string | Run one prompt and exit. |

## Slash Commands

Core:

```text
/help
/status
/status full
/doctor
/tools
/model
/language zh
/shell on
/browser on
/permissions
/cache
/cache report
/usage
/cost
/runs
/trace <run>
/events <run>
/artifacts
/ask <question>
/stop
```

Remote:

```text
/remote-control
/remote-control status
/remote-control wechat login
/remote-control wechat start
/remote-control wechat stop
/remote-control wecom start
/remote-control wecom stop
```

Skills, plugins, and MCP:

```text
/skills install <source> [name]
/skills install-all <source>
/skills search <query>
/skills validate [name]
/skills run <name> <task>
/plugins install <source>
/plugins validate [name]
/mcp list
/mcp status
/mcp call <server> <tool> <json>
```

Agents:

```text
/agents
/agents start <goal>
/agents status
/agents message <role> <message>
/agents stop
```

## Remote Commands

WeChat and WeCom expose a smaller command set:

```text
/help
/status
/status full
/project
/project <path>
/run <task>
/continue
/ask <question>
/artifacts
/usage
/stop
```

Personal WeChat uses text approval:

```text
1  allow once
2  allow for this session
3  reject
4  stop task
```

WeCom may use card approval when the configured adapter supports it.

## Environment Variables

Provider:

| Variable | Meaning |
| --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeek API key. |
| `DEEPSEEK_BASE_URL` | Optional provider base URL. |
| `DEEPSEEKCODE_MODEL` | Default model. |
| `DEEPSEEKCODE_PROMPT_AUDIT_DIR` | Enables prompt audit output when set. Default off. |

WeCom:

| Variable | Meaning |
| --- | --- |
| `DEEPSEEKCODE_WECOM_BOT_ID` | WeCom bot id. |
| `DEEPSEEKCODE_WECOM_BOT_SECRET` | WeCom bot secret. |
| `DEEPSEEKCODE_WECOM_ALLOWED_USERS` | Optional allowlist. |
| `DEEPSEEKCODE_WECOM_ALLOWED_GROUPS` | Optional group allowlist. |
| `DEEPSEEKCODE_WECOM_PROJECT_ROOTS` | Allowed project roots for remote switching. |

Personal WeChat OpenClaw:

| Variable | Meaning |
| --- | --- |
| `DEEPSEEKCODE_WECHAT_OPENCLAW_ENABLED` | Enables OpenClaw channel. |
| `DEEPSEEKCODE_WECHAT_ALLOWED_USERS` | Optional user allowlist. |
| `DEEPSEEKCODE_WECHAT_ALLOWED_GROUPS` | Optional group allowlist. |
| `DEEPSEEKCODE_WECHAT_PROJECT_ROOTS` | Allowed project roots for remote switching. |
| `DEEPSEEKCODE_WECHAT_MENTION_NAMES` | Names that activate group chat messages. |
| `DEEPSEEKCODE_WECHAT_QR_POLL_INTERVAL_MS` | QR polling interval. |
| `DEEPSEEKCODE_WECHAT_LONG_POLL_TIMEOUT_MS` | Message long-poll timeout. |

## Provider Tool Surface

DeepSeekCode exposes tools through native provider `tools[]`. Important tool groups:

| Tool group | Examples |
| --- | --- |
| Files | `read_file`, `write_file`, `append_file`, `patch_file`, `list_files`, `glob_files`, `grep_files` |
| Shell | `run_command` |
| Browser | `browser_session_start`, `browser_snapshot`, `browser_screenshot`, `browser_click`, `browser_type`, `browser_agent` |
| Artifacts | `validate_artifact`, `create_docx`, `create_pptx`, `create_xlsx`, `create_pdf` |
| Verification | `verify_task`, `verify_project`, `launch_project` |
| Skills/plugins | `search_skills`, `invoke_skill`, `install_skill`, `install_plugin` |
| MCP | `mcp_call` |
| Agents | `invoke_agent`, `start_agent_workflow`, `send_agent_message`, `agent_status`, `finish_agent_workflow` |
| Memory | `memory_search`, `memory_capture`, `memory_raw_search` |

## `TaskCompletionContract`

`verify_task` accepts a model-authored contract:

```ts
interface TaskCompletionContract {
  goal?: string;
  expected_artifacts?: string[];
  verifiable_behaviors?: string[];
  acceptance_criteria?: string[];
  user_constraints?: string[];
}
```

Runtime uses the contract plus actual files/tool results to choose validators. It does not infer completion from prompt keywords.

## `verify_task`

Generic completion gate for non-chat tasks.

Input:

```ts
{
  type: "verify_task";
  path?: string;
  objective?: string;
  contract?: TaskCompletionContract;
  mode?: "auto" | "quick" | "full";
  install_dependencies?: boolean;
  run_build?: boolean;
  run_tests?: boolean;
  launch?: boolean;
  capture_preview?: boolean;
  timeout_ms?: number;
}
```

Output:

```ts
interface ProjectVerificationReport {
  status: "succeeded" | "failed";
  root: string;
  summary: string;
  checks: Array<{ name: string; status: "passed" | "failed" | "skipped" | "warning"; detail: string }>;
  artifacts: string[];
  previewPath?: string;
  startCommand?: string;
}
```

`verify_task` may call package checks, artifact validators, script discovery, launch smoke checks, and browser/document/data validators. Failed checks are compacted and replayed to the model for repair.

## Agent Workflow Types

```ts
interface AgentRoleSpec {
  name: string;
  responsibility?: string;
  tools?: string[];
  disallowed_tools?: string[];
  skills?: string[];
  acceptance?: string[];
}
```

Workflow tools:

- `start_agent_workflow`: creates role specs and a shared blackboard.
- `send_agent_message`: records role-to-role handoff.
- `agent_status`: summarizes role state, current task, latest tool, and blockers.
- `finish_agent_workflow`: closes only after Tester/Reviewer acceptance.

## Remote Delivery Plan

Remote channels should display concise progress and completion:

| Artifact | Delivery |
| --- | --- |
| HTML/UI | screenshot and entry summary |
| DOCX/PPTX/XLSX/PDF | previewable file, optional first-page/slide image |
| Markdown/text | short chat summary, file only when requested |
| Image/media | direct image/file |
| Multi-file project | manifest, entry, startup command, verification summary, key preview |

The model may suggest important outputs, but runtime decides delivery from real files.

## Status Values

Use these public status labels in docs and UI:

- `verified`: tested in real runs
- `partial`: implemented but still has known gaps
- `experimental`: usable for testing, not yet mature
- `reserved`: planned or compatibility placeholder

Avoid claiming that experimental remote, MCP, or multi-agent flows are production-complete.
