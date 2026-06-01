# DeepSeekCode CLI Reference

This reference covers the command line and slash commands that ship in the public release tree.

## Package Scripts

| Script | Purpose |
| --- | --- |
| `npm run build` | Compile TypeScript into `dist/`. |
| `npm run typecheck` | Check TypeScript without writing build output. |
| `npm run dev` | Run the CLI from `src/cli/main.tsx` with `tsx`. |
| `npm run start` | Run the compiled CLI from `dist/cli/main.js`. |
| `npm run doctor` | Run `deepseekcode --doctor` through the compiled CLI. |

Install and build before using `npm run start`:

```bash
npm install
npm run build
npm run start -- --project "D:\code\DeepSeekTest"
```

Use `npm run dev` when running from source:

```bash
npm run dev -- --project "D:\code\DeepSeekTest"
```

## CLI Flags

```text
deepseekcode [options]
```

| Flag | Description |
| --- | --- |
| `--project <path>` | Project directory to inspect and edit. Defaults to the current directory. |
| `--data-dir <path>` | Runtime data directory. Defaults to `DEEPSEEKCODE_HOME` or `~/.deepseekcode`. |
| `--model <model>` | DeepSeek model or provider profile name. Defaults to `DEEPSEEK_MODEL` or `deepseek-v4-flash`. |
| `-p, --prompt <text>` | Run one headless prompt and exit. |
| `-c, --continue` | Continue the most recent persisted transcript session before running. |
| `--resume <session-id>` | Resume a specific persisted transcript session before running. |
| `--doctor` | Print runtime diagnostics. |
| `--verify-model` | Verify DeepSeek model access. |
| `--allow-shell` | Enable shell tool execution for the session. |
| `--allow-browser` | Enable browser bridge actions for the session. |
| `--permission-profile <profile>` | Use `safe`, `dev`, `browser`, or `open`. |
| `--json` | Print headless prompt events as JSON lines. |

Examples:

```bash
npm run start -- --project "D:\code\DeepSeekTest"
npm run start -- --project . --permission-profile dev
npm run start -- --project . --continue --prompt "Continue the previous task"
npm run start -- --project . --resume session_xxx --prompt "Continue the paused work"
npm run start -- --project . --verify-model
npm run start -- --project . --prompt "Summarize this repository" --json
```

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `DEEPSEEK_BASE_URL` | DeepSeek-compatible base URL. Defaults to `https://api.deepseek.com`. |
| `DEEPSEEK_API_KEY` | API key used by the default DeepSeek provider. |
| `DEEPSEEK_MODEL` | Default model. The release default is `deepseek-v4-flash`. |
| `DEEPSEEK_TIMEOUT_SECS` | Provider timeout in seconds. |
| `DEEPSEEKCODE_HOME` | Runtime data directory override. |
| `DEEPSEEKCODE_PROVIDER_CONFIG` | Path to a provider profile JSON file. |
| `DEEPSEEKCODE_PERMISSION_PROFILE` | Default permission profile. |
| `DEEPSEEKCODE_REASONING_EFFORT` | Reasoning effort used by provider config. |
| `DEEPSEEKCODE_MAX_OUTPUT_TOKENS` | Max output tokens used by provider config. |
| `DEEPSEEKCODE_BROWSER_CDP_URL` | Optional browser CDP endpoint. |
| `DEEPSEEKCODE_SEARCH_ENGINE` | Optional search engine setting for browser/search adapters. |

Do not commit real `.env` files. Use `.env.example` as the public template.

## Permission Profiles

| Profile | Meaning |
| --- | --- |
| `safe` | Shell and browser actions are off. |
| `dev` | Shell actions are on, browser actions are off. |
| `browser` | Browser actions are on, shell actions are off. |
| `open` | Shell and browser actions are both on. |

Aliases accepted by the runtime include `default`, `plan`, `acceptEdits`, `dontAsk`, and `bypassPermissions`.

## Slash Commands

The command list is available inside the workbench with `/help`. Common commands:

| Command | Purpose |
| --- | --- |
| `/help` | Show command help. |
| `/doctor` | Show provider and runtime diagnostics. |
| `/version` | Show version information. |
| `/init` | Initialize project-local DeepSeekCode files. |
| `/model` | Open the in-TUI model selector. Use Up/Down and Enter to switch. |
| `/model flash` / `/model pro` | Switch the current TUI session between `deepseek-v4-flash` and `deepseek-v4-pro`. |
| `/model verify` | Verify configured model access. |
| `/effort` | Inspect or adjust inference effort settings. |
| `/project` | Inspect project scope. |
| `/config` | Show runtime configuration. |
| `/status` | Show current runtime status. |
| `/runs` | List recent durable runs. |
| `/queue` | Inspect queued work. |
| `/pause`, `/run-resume`, `/cancel` | Control a durable run when supported. |
| `/sessions` | Inspect saved sessions. |
| `/resume <session-id>|current|clear` | Focus, inspect, or clear the current transcript session. |
| `/plan` | Enter or manage plan mode. |
| `/todo`, `/todos` | Manage task todo state. |
| `/tasks` | Inspect task records. |
| `/events` | List runtime events. |
| `/trace <run>` | Inspect a run trace. |
| `/rewind` / `/checkpoint` | Create, diff, inspect, or restore workspace checkpoints. |
| `/context` | Inspect selected context. |
| `/files` | Show file context. |
| `/diff git` | Show Git diff for the project. |
| `/review` | Ask for a code review pass. |
| `/security-review` | Ask for a security-oriented review pass. |
| `/permissions` | Show or adjust permission profile. |
| `/tools` | List tool availability. |
| `/cmd <command>` | Run a shell command when shell permission is enabled. |
| `/shell on|off` | Toggle shell tool permission. |
| `/browser on|off` | Toggle browser bridge permission. |
| `/agents` | Inspect agent roles. |
| `/hooks` | Inspect hook configuration. |
| `/skills` | Inspect skills. |
| `/plugins` | Inspect plugins. |
| `/logs` | Inspect runtime logs. |
| `/memory` | Inspect or export project memory. |
| `/mcp` | Inspect MCP adapters. |
| `/cache` | Show cache readiness and telemetry. |
| `/cache guard <goal>` | Preflight a task for cache stability. |
| `/cache prepare <goal>` | Prepare reusable context for a task. |
| `/cache profile save <name> <goal>` | Save a reusable cache profile. |
| `/cost` | Show token and cost summaries. |
| `/usage` | Show usage snapshots. |
| `/stats` | Show runtime statistics. |
| `/approval list` | List pending approval gates. |
| `/validation` | Inspect validation gates. |
| `/bridge` | Inspect bridge state. |
| `/diag` | Show diagnostics. |
| `/multi provider <task>` | Run a multi-agent provider workflow. |
| `/clear` | Clear current UI/session content. |
| `/quit` | Exit the workbench. |

Plugin and user commands can add more entries. Use `/help` in a live session for the exact catalog.

## Headless Mode

Run one prompt and exit:

```bash
npm run start -- --project . --prompt "Summarize the runtime modules"
```

Emit machine-readable events:

```bash
npm run start -- --project . --prompt "List public commands" --json
```

## Diagnostics

Run:

```bash
npm run doctor
npm run start -- --project . --verify-model
```

If diagnostics fail, check:

- The project path exists.
- `.env` or shell variables contain `DEEPSEEK_API_KEY`.
- The selected model is available to the key.
- The data directory is writable.
- Permission profile matches the intended tool use.

Related:

- [Guide](./GUIDE.md)
- [Architecture](./ARCHITECTURE.md)
