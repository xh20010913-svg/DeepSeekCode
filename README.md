<p align="center">
  <img src="assets/deepseekcode-logo.svg" alt="DeepSeekCode" width="640"/>
</p>

<p align="center">
  <strong>English</strong>
  &nbsp;|&nbsp;
  <a href="./README.zh-CN.md">简体中文</a>
  &nbsp;|&nbsp;
  <a href="./README.ja-JP.md">日本語</a>
  &nbsp;|&nbsp;
  <a href="https://xh20010913-svg.github.io/DeepSeekCode/">Website</a>
  &nbsp;|&nbsp;
  <a href="./GUIDE.md">Guide</a>
  &nbsp;|&nbsp;
  <a href="./ARCHITECTURE.md">Architecture</a>
  &nbsp;|&nbsp;
  <a href="./CLI_REFERENCE.md">CLI</a>
</p>

<p align="center">
  <a href="https://github.com/xh20010913-svg/DeepSeekCode"><img src="https://img.shields.io/github/stars/xh20010913-svg/DeepSeekCode.svg?style=flat-square&color=dbab09&labelColor=161b22&logo=github&logoColor=white" alt="GitHub stars"/></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/xh20010913-svg/DeepSeekCode.svg?style=flat-square&color=8b949e&labelColor=161b22" alt="license"/></a>
  <a href="./package.json"><img src="https://img.shields.io/badge/node-%3E%3D22-5fa04e.svg?style=flat-square&labelColor=161b22&logo=nodedotjs&logoColor=white" alt="Node >= 22"/></a>
  <a href="./package.json"><img src="https://img.shields.io/badge/runtime-TypeScript-3178c6.svg?style=flat-square&labelColor=161b22&logo=typescript&logoColor=white" alt="TypeScript"/></a>
  <a href="https://platform.deepseek.com"><img src="https://img.shields.io/badge/provider-DeepSeek-38bdf8.svg?style=flat-square&labelColor=161b22" alt="DeepSeek provider"/></a>
</p>

<h3 align="center">A DeepSeek-first local coding agent for terminal work, long-running tasks, and local tools.</h3>

<p align="center">
  <img src="assets/readme-runtime-terminal.png" alt="DeepSeekCode running in Windows Terminal" width="880"/>
</p>

DeepSeekCode is a TypeScript runtime for agentic local work. It keeps stable system rules, tool schemas, project memory, repository facts, and cache pins early in the prompt, then places volatile user requests and compact tool feedback late to improve DeepSeek prefix-cache reuse.

## What is included

- Typed local tools for file reads/writes, patching, shell commands, browser actions, Office artifacts, MCP calls, skills, and validation.
- Durable SQLite state for runs, actions, artifacts, tasks, approvals, validations, usage, and cache telemetry.
- CLI session restore through `--continue` and `--resume <session-id>`.
- Compact `tool_result_summary` persistence so long stdout, diffs, and logs do not get replayed into every prompt.
- `runtime_run_state` summaries for continuing paused work across CLI process restarts.
- Multi-agent Planner -> Builder -> Tester -> Reviewer flow with compact role feedback and progress checkpoints.
- GitHub Pages website and public README assets with local image paths that render on GitHub.

## Install

Requires Node.js >= 22.

```bash
git clone https://github.com/xh20010913-svg/DeepSeekCode.git
cd DeepSeekCode
npm install
npm run build
```

Configure DeepSeek locally:

```bash
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-v4-flash
```

Start the workbench against a separate test project:

```bash
npm run start -- --project "D:\code\DeepSeekTest"
```

Continue the latest session after restarting the CLI:

```bash
npm run start -- --project "D:\code\DeepSeekTest" --continue -p "Continue from the last task"
```

Resume a specific session:

```bash
npm run start -- --project "D:\code\DeepSeekTest" --resume session_xxx -p "Continue the paused work"
```

## Real Workflow Checks

The release was tested in `D:\code\DeepSeekTest` with realistic agent scenarios:

- Cross-process session resume: create a Node.js order project, continue with discount support, then write an acceptance report.
- Multi-agent flow: create a SaaS incident handoff package through Planner, Builder, Tester, and Reviewer.
- Prompt audit confirmed that `recent_conversation`, `tool_result_summary`, and `runtime_run_state` are included in provider prompts.
- Build and typecheck passed in the release tree.

## Core Commands

| Command | Purpose |
| --- | --- |
| `/doctor` | Check provider, model, paths, and permissions. |
| `/model` | Open the TUI model selector; use Up/Down and Enter to switch. |
| `/model flash` / `/model pro` | Switch the current session between `deepseek-v4-flash` and `deepseek-v4-pro`. |
| `/cache` | Inspect cache readiness, profiles, guard policy, and prompt shape. |
| `/sessions` / `/resume` | List or focus persisted local transcript sessions. |
| `/runs` / `/trace` | Inspect durable run/action/task state. |
| `/queue` / `/pause` / `/run-resume` | Inspect and control durable task queues. |
| `/multi provider <task>` | Run the Planner -> Builder -> Tester -> Reviewer workflow. |
| `/validation` / `/approval` | Inspect validation and approval gates. |

See [CLI Reference](./CLI_REFERENCE.md) for the full command surface.

## Architecture

DeepSeekCode follows a ClaudeCode-style loop adapted for DeepSeek:

1. Build stable prompt prefix and dynamic context blocks.
2. Classify whether local tools are needed.
3. Ask the provider for a typed action envelope.
4. Execute local tools with path, permission, and validation controls.
5. Persist compact tool feedback, run checkpoints, artifacts, usage, and cache telemetry.
6. Feed only high-value summaries back into the next turn.

More detail is in [Architecture](./ARCHITECTURE.md).

## Public Files

This release tree intentionally includes runtime source, website, README files, public assets, and user-facing docs. It excludes `.env`, local test outputs, research notes, staging folders, runtime state databases, `node_modules`, and private development handoff documents.

## Links

- [Guide](./GUIDE.md)
- [Architecture](./ARCHITECTURE.md)
- [CLI Reference](./CLI_REFERENCE.md)
- [Website Guide](./website/guide.html)

## License

MIT
