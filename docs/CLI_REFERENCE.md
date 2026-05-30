# DeepSeekCode CLI Reference

## Startup

```powershell
npm run build
npm run start -- --project "D:\code\DeepSeekTest"
```

Development:

```powershell
npm run dev -- --project "D:\code\DeepSeekTest"
```

Health checks:

```powershell
npm run doctor
npm run smoke
npm run parity
```

## Environment

```text
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=<local secret only>
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEKCODE_MAX_OUTPUT_TOKENS=2200
```

Use `deepseek-v4-flash` for live smoke tests unless you explicitly choose a more expensive model.

## Common Slash Commands

| Command | Purpose |
| --- | --- |
| `/help` | Show grouped command help. |
| `/doctor` | Diagnose provider, project, permissions, and state path. |
| `/status` | Show current project, model, cache, permissions, runs, and gates. |
| `/config` | Show redacted runtime configuration. |
| `/model verify` | Verify the configured DeepSeek model. |
| `/project` | Show project root and state scope. |
| `/sessions` | List persisted sessions. |
| `/runs` | List recent runs. |
| `/events [run-id]` | Inspect recent events. |
| `/trace <run-id>` | Inspect durable run/task/action/artifact trace rows. |
| `/tasks [run-id]` | List task DAG state. |
| `/clear` | Clear visible transcript. |
| `/quit` | Exit the TUI. |

## Cache Commands

| Command | Purpose |
| --- | --- |
| `/cache` | Show cache readiness and telemetry. |
| `/cache guard <goal>` | No-model preflight before a large task. |
| `/cache prepare <goal>` | Apply stable pins and rerun preflight. |
| `/cache pin suggest <goal>` | Suggest reusable stable files for cache pins. |
| `/cache pin apply <goal>` | Apply recommended stable pins. |
| `/cache pin audit` | Check pin size, duplication, and likely secret risk. |
| `/cache shapes [limit]` | Show content-free prompt-shape history. |
| `/cache profile save <name> <goal>` | Save a reusable task-shape profile. |
| `/cache profile forecast <goal>` | Estimate reuse against saved profiles. |
| `/cache profile match <goal>` | Rank saved profiles for a new goal. |
| `/cache profile prepare <name>` | Reuse a saved goal and prepare the prefix. |

## Tool And Permission Commands

| Command | Purpose |
| --- | --- |
| `/shell on|off` | Enable or disable shell tool access. |
| `/browser on|off` | Enable or disable browser-open access. |
| `/cmd <command>` | Run a shell command when shell is enabled or approved. |
| `/tools` | Show tool availability and permission state. |
| `/permissions` | Show or change permission profile. |
| `/approval list` | List approval gates. |
| `/approval approve <run-id> <gate-id>` | Approve a pending gate. |
| `/approval reject <run-id> <gate-id>` | Reject a pending gate and trigger rework when applicable. |
| `/diff git` | Inspect project git diff with a structured panel. |
| `/validation` | Show recent artifact validation gates. |

## Planning, Memory, Skills, Plugins, MCP

| Command | Purpose |
| --- | --- |
| `/plan start` | Create a reviewable plan. |
| `/plan show` | Show current plan preview. |
| `/plan approve|reject|cancel` | Decide a pending plan gate. |
| `/memory list` | List memory promotions. |
| `/memory accepted` | Show accepted project memory. |
| `/memory export [path]` | Export accepted memory. |
| `/skills` | Discover local skills. |
| `/plugins` | Show plugin manifest state. |
| `/mcp` | Show MCP server/tool status. |
| `/multi provider <task>` | Start provider-backed Planner -> Builder -> Tester -> Reviewer flow. |

## Testing Guidance

Fast local check:

```powershell
npm run build
npm run smoke
```

Reference-shape check:

```powershell
npm run parity
```

Provider smoke:

```powershell
$env:DEEPSEEK_MODEL="deepseek-v4-flash"
npm run start -- --project "D:\code\DeepSeekTest"
```

Do not run expensive models for documentation screenshots. Do not publish `.env`, runtime databases, smoke output directories, or screenshots containing secrets.
