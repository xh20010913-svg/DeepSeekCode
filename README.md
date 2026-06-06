<p align="center">
  <img src="assets/deepseekcode-logo.svg" alt="DeepSeekCode" width="640"/>
</p>

<p align="center">
  <a href="./README.zh-CN.md">简体中文</a>
  &nbsp;|&nbsp;
  <strong>English</strong>
  &nbsp;|&nbsp;
  <a href="https://xh20010913-svg.github.io/DeepSeekCode/">Website</a>
  &nbsp;|&nbsp;
  <a href="./GUIDE.md">Guide</a>
  &nbsp;|&nbsp;
  <a href="./ARCHITECTURE.md">Architecture</a>
  &nbsp;|&nbsp;
  <a href="./CLI_REFERENCE.md">CLI</a>
  &nbsp;|&nbsp;
  <a href="./DEVELOPMENT.md">Development</a>
  &nbsp;|&nbsp;
  <a href="./API_REFERENCE.md">API</a>
</p>

# DeepSeekCode

DeepSeekCode is a DeepSeek-first local engineering agent runtime. It connects native DeepSeek tool calls, local files, shell/browser permission gates, project state, long-term memory, skills/plugins, MCP, WeChat remote control, multi-agent workflows, project launch/verification, and failure repair in one resumable TypeScript runtime.

Current version: `v0.2.9`. Capability labels are intentionally honest: verified, partial, experimental, or reserved.

```text
TUI / WeChat / CLI input
  -> QueryEngine
  -> stable system prompt + tool schemas + skills index + project state
  -> DeepSeek native tool_calls
  -> local typed tools
  -> summarized tool_result messages
  -> continue, repair, verify, or answer
```

## Runtime Screenshots

| Desktop TUI mirroring WeChat input/output | Personal WeChat remote result |
| --- | --- |
| ![Desktop TUI with WeChat sync](assets/screenshots/wechat-desktop-sync.png) | ![Personal WeChat remote result](assets/screenshots/wechat-mobile-result.png) |

GSAP skill invocation and entry-file validation:

![GSAP skill invocation](assets/screenshots/gsap-skill-run.png)

## Quickstart

Requirements:

- Node.js 22 or newer.
- A DeepSeek API key.
- A project directory, for example `D:\code\DeepSeekTest`.

```cmd
npm install -g @xh12312/deepseekcode --registry https://registry.npmjs.org/
cd /d D:\code\DeepSeekTest
deepseekcode --model deepseek-v4-flash
```

The public command is `deepseekcode`. The package intentionally does not install a `deepseek` alias.

Environment:

```env
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEKCODE_LANGUAGE=zh-CN
```

## Core Commands

| Command | Purpose |
| --- | --- |
| `/doctor` | Diagnose provider, native tool calling, state paths, skills/plugins, cache, and permissions. |
| `/tools` | List real provider-facing tools. |
| `/model` | Open the model selector. |
| `/shell on\|off` | Toggle shell for this session. |
| `/browser on\|off` | Toggle browser/CDP bridge. |
| `/status` / `/status full` | Show concise or detailed run status. |
| `/cache report` | Explain cache hit rate, stable prefix, dynamic context, and low-hit causes. |
| `/ask <question>` | Ask a read-only side question while a long task continues. |
| `/remote-control` | Bind or manage WeChat / WeCom remote control. |
| `/skills` `/plugins` `/mcp` | Manage extension surfaces. |

## Windows Reliability And Project Verification

`run_command` now performs a Windows preflight before execution. It detects common POSIX commands such as `mkdir -p`, `cat`, `touch`, `rm -rf`, heredocs, and native dependency failures such as `node-gyp` / Visual Studio / Node-version issues. The failure is returned as tool feedback so the model can repair the command or choose a simpler dependency.

`verify_project` and `launch_project` are generic runtime tools:

- `package.json`: install/build/test/start/dev when allowed.
- HTML: open in a browser, take a screenshot, detect blank pages, missing assets, and console/resource errors.
- Services: start and check ports/health when possible.
- Office/PDF: verify file existence and previewability.
- Multi-file projects: produce entry, manifest, screenshot, and launch instructions.

## WeChat Remote Control

Supported channels:

- WeCom through `@wecom/aibot-node-sdk`.
- Personal WeChat OpenClaw through Tencent `@tencent-weixin/openclaw-weixin@2.4.4` (experimental).

Recommended flow:

```text
/remote-control
/remote-control wechat login
/remote-control wechat start
/remote-control wecom start
```

Pure remote mode:

```cmd
deepseekcode --wechat-login --project "D:\code\DeepSeekTest"
deepseekcode --wechat --project "D:\code\DeepSeekTest" --model deepseek-v4-flash
deepseekcode --wecom --project "D:\code\DeepSeekTest" --model deepseek-v4-flash
```

Remote messages are rendered as concise progress, approvals, side-channel answers, and artifact previews. Source files are not pushed one by one into chat.

## Skills, Plugins, MCP, And Multi-Agent

Skills can be installed from local paths, GitHub URLs, Git URLs, and `file://` Git repositories:

```text
/skills install greensock/gsap-skills
/skills install-all greensock/gsap-skills
/skills search gsap
/skills run gsap-core "add production animation to this page"
```

The model can automatically call `search_skills` and `invoke_skill` from task semantics. Users do not need to mention a skill every time.

MCP is exposed through a unified `mcp_call` surface. Direct per-tool native schema expansion is still in progress.

Multi-agent workflow is experimental but testable. The main agent can create Planner/Builder/Tester/Reviewer roles, maintain a shared blackboard, and require Reviewer acceptance for real artifacts, startup, build/test, screenshots, and requirement coverage.

## Capability Matrix

| Capability | Status | Notes |
| --- | --- | --- |
| DeepSeek native tool calls | Verified | Unsupported gateways fail clearly. |
| File tools | Verified | Read/write/patch/list/search/glob are connected. |
| Shell | Permissioned | Off by default; approved through TUI/WeChat/WeCom gates. |
| Windows preflight | Verified | Detects common POSIX command and native dependency issues. |
| Project verification | Partial | Generic launch/build/test/browser checks are connected and improving. |
| Browser/CDP | Partial | Screenshots and basic page checks are connected. |
| DOCX/PPTX/XLSX | Partial | Real files can be generated; layout QA is still improving. |
| PDF | Experimental | Conservative support only. |
| TencentDB-Agent-Memory | Verified | Local SQLite memory and recall are connected. |
| Skills/plugins | Verified | Install, search, validate, invoke, and auto-candidate injection are connected. |
| MCP | Partial | Unified `mcp_call` is connected; full native schema expansion is pending. |
| WeCom remote | Experimental / testable | Text tasks, progress, approvals, artifact summaries. |
| Personal WeChat OpenClaw | Experimental / testable | QR login, long polling, text tasks, approvals, artifact summaries. |
| Multi-agent workflow | Experimental / testable | Roles, blackboard, reviewer, and checkpoints are connected. |
| `/ask` side questions | Verified | Read-only answers during active runs. |
| `computer_use` | Reserved | Not advertised until a real GUI bridge exists. |

## Test Plan

Run tests from the release tree, and keep generated artifacts in an external test directory such as `D:\code\DeepSeekTest`.

```cmd
npm.cmd run typecheck
npm.cmd run build
npm.cmd pack --dry-run
```

Recommended real scenarios:

- Multi-agent frontend/backend shop: generate, install, launch, verify, self-repair.
- GSAP animation page: automatic skill discovery and artifact screenshot.
- DOCX / PPTX / XLSX / PDF generation and preview delivery.
- MCP mock stdio/http tool call and failure recovery.
- WeChat remote chat, task, `/ask`, `/status full`, and artifact preview.
- Long task cache report and token/cost comparison.

## License

MIT
