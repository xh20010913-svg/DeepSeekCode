# DeepSeekCode Guide

This guide explains how to run DeepSeekCode v0.2 as a local agent workbench.

## 1. Install

```bash
npm install -g @xh12312/deepseekcode
cd D:\work\agent-test
deepseekcode
```

GitHub network install is also supported for testing the current `main` branch:

```bash
npm install -g github:xh20010913-svg/DeepSeekCode
```

The installed command is `deepseekcode`. The package does not install a `deepseek` alias. When no `--project` is passed, the current directory is the project. When no `--data-dir` is passed, runtime data is written to `<project>\.deepseekcode`.

On Windows PowerShell, if the execution policy blocks npm's generated `deepseekcode.ps1` shim, run `deepseekcode.cmd`. In cmd, keep using `deepseekcode`.

Source checkout for development:

```bash
git clone https://github.com/xh20010913-svg/DeepSeekCode.git
cd DeepSeekCode
npm install
npm run build
```

Run from source during development:

```bash
npm run dev -- --project "D:\work\agent-test"
```

Run the compiled CLI:

```bash
npm run start -- --project "D:\work\agent-test"
```

## 2. Configure

Minimal provider configuration:

```bash
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEKCODE_LANGUAGE=zh-CN
```

Useful optional settings:

| Setting | Purpose |
| --- | --- |
| `DEEPSEEK_TIMEOUT_SECS` | Provider request timeout. |
| `DEEPSEEKCODE_HOME` | Runtime data directory. |
| `DEEPSEEKCODE_STARTUP_SHELL_PROMPT` | Set `0` to skip the startup shell permission prompt. |
| `DEEPSEEKCODE_PROVIDER_CONFIG` | Provider profile JSON path. |
| `DEEPSEEKCODE_PERMISSION_PROFILE` | `safe`, `dev`, `browser`, or `open`. |
| `DEEPSEEKCODE_PROMPT_AUDIT_DIR` | Enable debug prompt audit output. |
| `DEEPSEEKCODE_TDAI_MEMORY` | `on` by default. Set `off` to disable TencentDB-Agent-Memory. |
| `DEEPSEEKCODE_TDAI_CAPTURE` | Capture successful turns into long-term memory. |
| `DEEPSEEKCODE_TDAI_RECALL` | Recall long-term memory before model calls. |
| `DEEPSEEKCODE_TDAI_EXTRACTION` | Extract structured L1/L2/L3 memories with the configured provider. |
| `DEEPSEEKCODE_TDAI_STORE` | `sqlite` by default; `tcvdb` when Tencent Cloud VectorDB is configured. |
| `DEEPSEEKCODE_TDAI_EMBEDDING_PROVIDER` | Optional embedding provider. `none` keeps semantic vector recall disabled. |
| `DEEPSEEKCODE_PRICE_INPUT_PER_M` | Input-token price override. |
| `DEEPSEEKCODE_PRICE_OUTPUT_PER_M` | Output-token price override. |
| `DEEPSEEKCODE_PRICE_CACHE_HIT_PER_M` | Cache-hit input price override. |
| `DEEPSEEKCODE_PRICE_CACHE_MISS_PER_M` | Cache-miss input price override. |

## 3. Choose A Permission Profile

| Profile | Shell | Browser | Use when |
| --- | --- | --- | --- |
| `safe` | off | off | Read, edit, and validate files without external execution. |
| `dev` | on | off | Build, typecheck, test, and run local scripts. |
| `browser` | off | on | Validate web UI through the browser bridge. |
| `open` | on | on | Trusted local projects that need shell and browser. |

Examples:

```bash
deepseekcode --permission-profile dev
deepseekcode --allow-shell
deepseekcode --allow-browser
```

Inside the TUI, use `/permissions`, `/shell on|off`, and `/browser on|off`.

When the TUI starts with shell disabled, it asks whether to enable shell for the current session. Use Up/Down to choose, Enter to confirm, and Esc/N to keep it off. This does not rely on task keywords; actual `run_command` tool calls still pass through the runtime permission gate.

## 4. Native Tool Workflow

DeepSeekCode v0.2 requires native tool calls for local work:

```text
provider messages + tools schema
  -> assistant tool_calls
  -> local tool execution
  -> tool_result messages
  -> next provider turn
```

If a model or gateway does not support tool calling, the run fails with a clear provider error. It does not fall back to a JSON action planner.

## 5. Long-Term Memory

DeepSeekCode includes a vendored MIT runtime of TencentDB-Agent-Memory. It is enabled by default and stores memory under the runtime data directory:

```text
<data-dir>\tdai\memory-tdai\
```

What it does:

- recalls relevant long-term memory before prompt construction
- captures successful user/assistant turns after a run
- exposes `tdai_memory_search` and `tdai_conversation_search` as native read-only tools
- supports local SQLite by default
- supports Tencent Cloud VectorDB and embeddings only when explicitly configured

Useful commands:

```text
/memory status
/memory search 中文默认
/memory conversation 继续完善
```

Disable it for a run:

```bash
set DEEPSEEKCODE_TDAI_MEMORY=off
```

## 6. Skills And Plugins

Skills are `SKILL.md` instruction packs. Plugins can contribute commands, skills, and hooks.

```text
/skills
/skills search office
/skills install "D:\skills\office-report"
/skills install https://github.com/example/agent-skills/tree/main/office/report
/skills install file:///D:/repos/agent-skills.git#main:office/report
/skills update office-report
/skills validate

/plugins
/plugins install "D:\plugins\review-kit"
/plugins install https://github.com/example/deepseekcode-plugin
/plugins install file:///D:/repos/deepseekcode-plugin.git#main
/plugins enable review-kit
/plugins validate
```

Compatibility rules:

- `.deepseekcode` is the write target.
- `.claude` skill/plugin folders can be discovered as read-compatible sources.
- Git subpaths are checked for path traversal.
- `.env`, `.git`, `node_modules`, and OS metadata are filtered during installs.

## 7. Long Tasks

For long-running work, use sessions, runs, checkpoints, and reports:

```bash
deepseekcode --project "D:\work\agent-test" --continue -p "Continue the last task"
deepseekcode --project "D:\work\agent-test" --resume session_xxx -p "Continue the paused work"
```

Useful commands:

```text
/runs
/trace latest
/events current
/queue
/pause latest
/run-resume latest
/cancel latest
```

Multi-agent mode:

```text
/multi provider Build a small dashboard project with tests and review it.
```

The durable multi-agent flow uses Planner -> Builder -> Tester -> Reviewer, task records, compact role feedback, and run checkpoints.

## 8. Cache And Cost

DeepSeekCode keeps stable prompt blocks before dynamic context to improve provider prefix-cache reuse. Old history is compressed into:

- recent conversation
- rolling summary
- TencentDB-Agent-Memory recall
- `tool_result_summary`
- `runtime_run_state`
- artifact manifest

Inspect:

```text
/cache
/cache guard <goal>
/cache prepare <goal>
/usage
/cost
```

Prompt audit is a testing feature:

```bash
set DEEPSEEKCODE_PROMPT_AUDIT_DIR=D:\work\agent-test\prompt-audit
```

## 9. Real Scenario Testing

Run realistic tests in a separate project directory:

```bash
deepseekcode --project "D:\work\agent-test" --permission-profile dev
```

Recommended scenario set:

| Scenario | What to check |
| --- | --- |
| Large website | Multi-file HTML/CSS/JS generation, follow-up improvement, browser validation. |
| Defense PPT | Natural request, structure, visual slides, PPTX validation. |
| Course PPT | Research-heavy outline, diagrams, slide quality. |
| OFDR principles PPT | Technical explanation, diagrams, references, layout. |
| DOCX report | Title hierarchy, tables/lists, document validation. |
| Failure repair | Tool failure diagnosis, follow-up fix, final verification. |
| Multi-agent project | Planner/Builder/Tester/Reviewer handoff and checkpoints. |
| Resume | CLI restart and `--continue`/`--resume` recovery. |
| Long-term memory | Teach a durable preference, restart, recall it with `/memory search`, then verify a natural follow-up uses it. |

Export a report:

```text
/runs report latest "D:\work\agent-test"
```

## 10. Release Checks

```bash
npm run typecheck
npm run build
```

The public release includes runtime source, assets, website, and user manuals. It does not include test output, prompt audit logs, runtime databases, or development handoff notes.

