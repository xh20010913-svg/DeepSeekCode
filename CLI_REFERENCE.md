# DeepSeekCode CLI Reference

Package: `@xh12312/deepseekcode`

Public command:

```cmd
deepseekcode
```

The package does not install a `deepseek` alias.

## Install

```cmd
npm install -g @xh12312/deepseekcode --registry https://registry.npmjs.org/
cd /d D:\code\DeepSeekTest
deepseekcode --model deepseek-v4-flash
```

## CLI Options

| Option | Description |
| --- | --- |
| `--project <path>` | Project root. Defaults to current directory. |
| `--data-dir <path>` | Runtime state directory. Defaults to `<project>\.deepseekcode`. |
| `--model <name>` | Model name. |
| `--continue` | Continue the latest session. |
| `--resume <session>` | Resume a specific session. |
| `--doctor` | Print diagnostics and exit. |
| `--allow-shell` | Enable shell for this process. Permission gates still apply. |
| `--allow-browser` | Enable browser/CDP bridge for this process. |
| `--permission-profile <name>` | `safe`, `dev`, `browser`, or `open`. |
| `--wecom` | Start WeCom remote channel. |
| `--wechat-login` | Login personal WeChat OpenClaw account. |
| `--wechat` | Start personal WeChat OpenClaw remote channel. |
| `-p, --prompt <text>` | Run a single prompt and exit. |

Examples:

```cmd
deepseekcode
deepseekcode --project D:\code\DeepSeekTest
deepseekcode --project D:\code\DeepSeekTest --model deepseek-v4-flash
deepseekcode --project D:\code\DeepSeekTest --continue -p "继续上一轮任务"
deepseekcode --doctor
```

## Core Slash Commands

| Command | Description |
| --- | --- |
| `/help` | Show help. |
| `/status` | Show concise runtime status. |
| `/status full` | Show detailed run/task/remote status. |
| `/doctor` | Diagnose provider, tools, state, remote, memory, skills, and permissions. |
| `/tools` | List provider-facing tools and status. |
| `/model` | Open model selector. |
| `/model flash` | Switch to flash model. |
| `/model pro` | Switch to pro model. |
| `/language zh` / `/language en` | Switch TUI language. |
| `/shell on` / `/shell off` | Toggle shell for this session. |
| `/browser on` / `/browser off` | Toggle browser bridge. |
| `/permissions` | Show permission profile and current grants. |
| `/cache` | Show cache readiness. |
| `/cache report` | Show provider telemetry, stable prefix, low-hit reasons, and advice. |
| `/usage` / `/cost` | Show tokens and estimated cost. |
| `/runs` | List persisted runs. |
| `/trace <run>` | Show action and artifact trace. |
| `/events <run>` | Show event log. |
| `/artifacts` | Show recent artifacts. |
| `/ask <question>` | Ask a read-only side question during an active long task. |
| `/stop` | Stop current run when supported. |

## Remote Control

TUI:

```text
/remote-control
/remote-control status
/remote-control wechat login
/remote-control wechat start
/remote-control wechat stop
/remote-control wecom start
/remote-control wecom stop
```

CLI:

```cmd
deepseekcode --wechat-login --project D:\code\DeepSeekTest
deepseekcode --wechat --project D:\code\DeepSeekTest --model deepseek-v4-flash
deepseekcode --wecom --project D:\code\DeepSeekTest --model deepseek-v4-flash
```

WeChat / WeCom:

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

Personal WeChat approval replies:

```text
1 allow once
2 allow for this session
3 reject
4 stop task
```

## Skills

```text
/skills
/skills list
/skills search <query>
/skills install <source> [name]
/skills install-all <source>
/skills update <name>
/skills validate [name]
/skills uninstall <name>
/skills run <name> <task>
```

Examples:

```text
/skills install greensock/gsap-skills
/skills install-all greensock/gsap-skills
/skills search gsap
/skills run gsap-core "给当前网页加滚动动画"
```

The model can auto-call skills through native `search_skills` and `invoke_skill`. `disable-model-invocation: true` disables automatic invocation for a skill.

## Plugins

```text
/plugins
/plugins list
/plugins install <source>
/plugins update <name>
/plugins validate [name]
/plugins enable <name>
/plugins disable <name>
/plugins uninstall <name>
```

Supported install sources include local paths, GitHub URLs, Git URLs, and `file://` Git repositories.

## MCP

```text
/mcp list
/mcp status
/mcp add <name> <config>
/mcp remove <name>
/mcp call <server> <tool> <json>
```

MCP is currently exposed through unified `mcp_call`. Permissioned MCP actions must pass through the same approval service as local tools.

## Multi-Agent

```text
/agents
/agents start <task>
/agents status
/agents message <role> <message>
/agents stop
/multi provider <task>
```

Native workflow tools:

- `start_agent_workflow`
- `send_agent_message`
- `agent_status`
- `finish_agent_workflow`

The workflow uses supervisor + shared blackboard + reviewer state and is marked experimental.

## Provider-Facing Tools Added In v0.2.9

| Tool | Purpose |
| --- | --- |
| `verify_project` | Inspect real project files and run build/test/browser/file checks where allowed. |
| `launch_project` | Start a project command or open an entry file and collect launch diagnostics. |
| `browser_agent` | Optional browser automation adapter backed by built-in Playwright/CDP behavior where available. |

`run_command` also performs Windows command preflight before execution.

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

Debug and accounting:

```text
DEEPSEEKCODE_PROMPT_AUDIT_DIR
DEEPSEEKCODE_TDAI_MEMORY
DEEPSEEKCODE_PRICE_INPUT_PER_M
DEEPSEEKCODE_PRICE_OUTPUT_PER_M
DEEPSEEKCODE_PRICE_CACHE_HIT_PER_M
DEEPSEEKCODE_PRICE_CACHE_MISS_PER_M
```
