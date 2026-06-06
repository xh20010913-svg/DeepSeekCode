# DeepSeekCode CLI Reference

## Binary

```cmd
deepseekcode [options]
```

The npm package only installs `deepseekcode`.

## Options

| Option | Description |
| --- | --- |
| `--project <path>` | Project directory. Defaults to current working directory. |
| `--data-dir <path>` | Runtime state directory. Defaults to `<project>\.deepseekcode`. |
| `--model <name>` | Model name, for example `deepseek-v4-flash` or `deepseek-v4-pro`. |
| `--permission-profile <safe\|dev\|custom>` | Permission profile. |
| `--allow-shell` | Start with shell enabled for the session. Commands still pass through runtime gates. |
| `--allow-browser` | Start with browser tools enabled. |
| `--continue` | Resume the latest project session when possible. |
| `--doctor` | Print configuration, provider, tools, skills, plugins, MCP, cache, and permission diagnostics. |
| `--wechat` | Start personal WeChat OpenClaw remote mode. Experimental. |
| `--wecom` | Start WeCom remote mode. Experimental. |
| `--wechat-login` | Start OpenClaw login flow. |

## Slash commands

| Command | Description |
| --- | --- |
| `/help` | Show command help. |
| `/doctor` | Runtime diagnostics. |
| `/tools` | Registered tools and status. |
| `/model` | Open model selector. |
| `/model flash` | Switch to flash model alias. |
| `/model pro` | Switch to pro model alias. |
| `/language zh` / `/language en` | Switch UI language. |
| `/shell on` / `/shell off` | Toggle shell permission. |
| `/browser on` / `/browser off` | Toggle browser permission. |
| `/status` | Current run summary. |
| `/status full` | Detailed run state, recent events, waiting item, and issues. |
| `/ask <question>` | Read-only side question while a task is running. |
| `/cache report` | Cache hit/miss, stable prefix, dynamic context, and suggestions. |
| `/skills` | List installed skills. |
| `/skills install <source>` | Install a skill from local path, GitHub, Git URL, or `file://`. |
| `/plugins` | List installed plugins. |
| `/plugins install <source>` | Install a plugin. |
| `/mcp` | MCP status and callable tools. |
| `/remote-control` | Remote channel panel. |
| `/remote-control wechat start` | Start personal WeChat remote. |
| `/remote-control wecom start` | Start WeCom remote. |
| `/agents status` | Show active multi-agent workflow. |
| `/artifacts` | Recent artifacts and delivery summary. |
| `/stop` | Stop the current run when cancellable. |

## Remote commands

Personal WeChat and WeCom share the same command vocabulary:

```text
/run <task>
/continue
/status
/status full
/ask <read-only question>
/artifacts
/usage
/stop
```

Normal chat is allowed. If no local work is needed, the runtime answers normally instead of forcing a task-result template.

## Environment variables

| Variable | Description |
| --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeek API key. |
| `DEEPSEEK_BASE_URL` | Provider base URL. |
| `DEEPSEEK_MODEL` | Default model. |
| `DEEPSEEKCODE_LANGUAGE` | `zh-CN` or `en`. |
| `DEEPSEEKCODE_PROMPT_AUDIT_DIR` | Optional prompt audit output directory. Off by default. |
| `DEEPSEEKCODE_WECHAT_OPENCLAW_ENABLED` | Enables personal WeChat OpenClaw remote. |
| `DEEPSEEKCODE_WECHAT_ALLOWED_USERS` | Optional personal WeChat user allowlist. |
| `DEEPSEEKCODE_WECHAT_ALLOWED_GROUPS` | Optional personal WeChat group allowlist. |
| `DEEPSEEKCODE_WECHAT_PROJECT_ROOTS` | Allowed project roots for WeChat remote project switching. |
| `DEEPSEEKCODE_WECOM_BOT_ID` | WeCom bot id. |
| `DEEPSEEKCODE_WECOM_BOT_SECRET` | WeCom bot secret. |
| `DEEPSEEKCODE_WECOM_ALLOWED_USERS` | Optional WeCom user allowlist. |
| `DEEPSEEKCODE_WECOM_PROJECT_ROOTS` | Allowed WeCom project roots. |

## Tool names

Important runtime tools:

- `read_file`, `write_file`, `append_file`, `apply_patch`
- `list_files`, `glob_files`, `grep_files`
- `run_command`
- `validate_artifact`
- `verify_task`
- `verify_project`
- `launch_project`
- `search_skills`, `invoke_skill`
- `mcp_call`
- `start_agent_workflow`, `send_agent_message`, `agent_status`, `finish_agent_workflow`
- `browser_session_start`, `browser_snapshot`, `browser_screenshot`, `browser_click`, `browser_type`

`verify_task` is the generic completion gate. It should be preferred over task-specific assumptions whenever a non-chat deliverable is produced.
