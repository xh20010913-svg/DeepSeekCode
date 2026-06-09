# DeepSeekCode Guide

This guide uses Chinese-first examples because the default TUI language is Chinese.

## 1. Install and start

```cmd
npm install -g @xh12312/deepseekcode --registry https://registry.npmjs.org/
cd /d D:\code\DeepSeekTest
deepseekcode --model deepseek-v4-flash
```

For source development:

```cmd
cd /d D:\code\DeepSeekCode\.release
npm install
npm run build
npm run start -- --project "D:\code\DeepSeekTest" --model deepseek-v4-flash
```

Each project stores state in its own `.deepseekcode` directory. Use a clean project directory for realistic tests to avoid mixing old artifacts with a new task.

## 2. Basic workflow

1. Start `deepseekcode` from the project directory.
2. Describe the task naturally.
3. Approve shell/browser/MCP actions only when the permission panel shows a command or operation you accept.
4. Let the runtime verify the result with `verify_task`.
5. If verification fails, the failure is sent back to the model for repair.

Example:

```text
帮我做一个库存分析报告，读取 data 目录里的 CSV，生成结论文档和一张图表，并验证输出。
```

This is not treated as a webpage task. The runtime verifies the actual report, data files, and chart artifacts.

## 3. Generic completion verification

`verify_task` is the completion gate for non-chat work. It uses a task contract plus real project files.

Supported verification families:

- code projects: install, build, test, start, dependency errors
- CLI/scripts: command output, exit code, generated files
- browser-visible outputs: screenshot, blank page, console error, missing local assets
- PDF: real `.pdf` structure, page count, readability, and optional preview rendering
- DOCX/PPTX/XLSX: structure and openability checks
- Markdown/reports: structure and requested sections
- data tasks: CSV/TSV/JSON/XLSX checks
- images/media: format and previewability
- skills/plugins/MCP: discovery, invocation, returned result
- automation tasks: logs and final state

If a task has no verifiable output, `verify_task` reports that instead of pretending completion.

## 4. Shell and Windows

Shell is off by default unless you enable it at startup or with:

```text
/shell on
```

On Windows, `run_command` uses PowerShell. POSIX commands such as `mkdir -p`, `cat`, `rm -rf`, and bash here-docs are rejected with PowerShell repair guidance before execution. Native dependency failures such as `node-gyp` and missing Visual Studio Build Tools are classified so the model can switch to a pure JavaScript or file-backed alternative when the task allows it.

## 5. Skills and plugins

Install a skill:

```text
/skills install https://github.com/greensock/gsap-skills
```

Use it naturally:

```text
做一个有滚动叙事动画的产品介绍页，动画要自然、有层次。
```

The model should search and invoke matching skills such as GSAP without requiring the phrase “use GSAP”. Skills guide task understanding and workflow; low-level tools still create and verify files.

## 6. Multi-agent work

You can ask for a team:

```text
开启多 agent 协作：先生成可审查计划，我确认后再执行；中间角色按任务动态生成。
```

DeepSeekCode first creates a Planner proposal and stops at `awaiting_approval`. You can choose `执行`, `修改：...`, `重生成`, or `取消` from the CLI prompt or by sending the same text from WeChat. `Planner` and `AcceptanceReviewer` are the only fixed roles; execution roles are generated from the task contract, output types, required tools, and verification risk. Each role keeps role-local assigned subtasks, transcript snippets, tool-result summaries, checkpoint, allowed tools, a generated workflow-local skill, risk checks, and handoff format. The bundled Pixel Agents panel opens automatically only for a new multi-agent run; continuation/repair turns reuse the same Pixel run without opening another browser tab. The panel shows the plan, dynamic roles, subtask graph, dependencies, evidence, blockers, artifacts, process/cache summary, and AcceptanceReviewer conclusions. Phone viewing uses the same Pixel run with a responsive task cockpit.

Backup commands:

```text
/agents dashboard
/agents dashboard share
/agents dashboard tunnel
/agents dashboard trace
/agents dashboard close
```

For phone access from WeChat/WeCom, point `DEEPSEEKCODE_AGENT_PANEL_PUBLIC_BASE_URL` to a trusted HTTPS tunnel. Without it, the Pixel Agents panel remains local-only. For a temporary local-only-to-phone preview, install `cloudflared` and run `/agents dashboard tunnel`; DeepSeekCode starts a Cloudflare Quick Tunnel to one tokenized run page. Treat that link as private: anyone with the URL and token can view the read-only panel until the token expires.

## 7. Remote control

From the TUI:

```text
/remote-control
/remote-control wechat start
/remote-control wecom start
```

Remote commands:

```text
/run 帮我继续完成这个项目
/ask 现在做到哪一步了？
/status
/status full
/artifacts
/stop
```

Remote output is intentionally compact. The computer performs the work; WeChat receives progress, permission choices, side answers, previews, and final summaries.

## 8. Cache and long tasks

Use:

```text
/cache report
/compact
/memory doctor
/project processes
/project stop latest
/terminal reset
```

DeepSeekCode keeps stable prompt blocks in a fixed order, summarizes old tool results, and records input/output/cache hit/cache miss/cost. `/compact` creates a five-part session capsule with user goals, completed facts, blockers, key artifacts, next steps, and recent tool summaries. `memory doctor` shows whether TencentDB memory was skipped by the prompt budget governor, recalled, or inserted into the prompt. For long tasks, `/status full` shows phase, recent tool, elapsed time, waiting item, issues, and next step. Long-running app servers are managed separately from the TUI: use `/project processes` and `/project stop latest|<pid>|all` to stop services started by `launch_project`, and `/terminal reset` if Windows Terminal shows mouse/paste escape characters after an abnormal exit.

## 9. Testing rules

Run tests in `D:\code\DeepSeekTest`.

```cmd
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test
npm.cmd pack --dry-run
npm.cmd pack
```

Do not commit `.env`, prompt audit, scenario reports, test outputs, `node_modules`, or generated user artifacts.
