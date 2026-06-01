import fs from "node:fs";
import path from "node:path";
import { buildTool, type Tools } from "../Tool.js";
import {
  captureBrowserScreenshot,
  captureBrowserSnapshot,
  clickBrowserSelector,
  typeBrowserSelector,
} from "../bridge/cdpClient.js";
import {
  ActionRequestSchema,
  ApplyPatchActionSchema,
  AskUserQuestionActionSchema,
  BrowserClickActionSchema,
  artifactKindFromPath,
  BrowserScreenshotActionSchema,
  BrowserSessionStartActionSchema,
  BrowserSnapshotActionSchema,
  BrowserTypeActionSchema,
  EnterPlanModeActionSchema,
  ExitPlanModeActionSchema,
  GlobFilesActionSchema,
  GrepFilesActionSchema,
  InvokeAgentActionSchema,
  InvokeSkillActionSchema,
  ListFilesActionSchema,
  McpCallActionSchema,
  PlannedComputerUseActionSchema,
  PlannedDocxActionSchema,
  PlannedPdfActionSchema,
  PlannedPptxActionSchema,
  ReadFileActionSchema,
  RunCommandActionSchema,
  SshReadFileActionSchema,
  SshRunActionSchema,
  SshWriteFileActionSchema,
  TodoWriteActionSchema,
  ValidateArtifactActionSchema,
  WriteFileActionSchema,
  type ActionRequest,
} from "../protocol/actions.js";
import { loadAgent } from "../agents/loader.js";
import { McpService } from "../services/mcp/mcpService.js";
import { BrowserTrajectoryRecorder } from "../services/browser/browserTrajectory.js";
import { PlanModeService } from "../services/plans/planModeService.js";
import { QuestionService, formatQuestionRecord } from "../services/questions/questionService.js";
import { readRemoteTextFile, writeRemoteTextFile } from "../services/remote/sshFileSync.js";
import { SshProfileService } from "../services/remote/sshProfileService.js";
import { runSshCommand, summarizeSshCommand } from "../services/remote/sshRemoteExecutor.js";
import { TodoService, formatTodoList } from "../services/todos/todoService.js";
import { loadSkill } from "../skills/loader.js";
import { summarizeValidation, validateArtifact } from "./artifact.js";
import { startBrowserSession } from "./browser.js";
import { applyTextPatch, globFiles, grepFiles, listFiles, readFileForTool, writeFile } from "./fs.js";
import { createDocxArtifact, createPptxArtifact } from "./officeArtifacts.js";
import { safeJoin } from "./pathSafety.js";
import { defaultShellPolicy, runCommand, summarizeCommand } from "./shell.js";

export const baseTools: Tools = [
  buildTool({
    name: "read_file",
    displayName: "Read",
    description: "Read a text file inside the selected project root. Binary artifacts and very large files return concise summaries.",
    inputSchema: ReadFileActionSchema,
    readOnly: true,
    concurrencySafe: true,
    run(input, context) {
      const output = readFileForTool(context.root, input.path);
      if (output.fullTextAvailable) {
        context.fileStateCache?.rememberRead(context.root, input.path);
      }
      return {
        data: output,
        result: {
          action_type: input.type,
          status: "succeeded",
          path: input.path,
          message: output.message,
        },
      };
    },
  }),
  buildTool({
    name: "list_files",
    displayName: "List",
    description: "List project files with a bounded recursive depth.",
    inputSchema: ListFilesActionSchema,
    readOnly: true,
    concurrencySafe: true,
    run(input, context) {
      const relativePath = input.path ?? "";
      const maxDepth = input.max_depth ?? 2;
      const entries = listFiles(context.root, relativePath, maxDepth);
      return {
        data: { entries },
        result: {
          action_type: input.type,
          status: "succeeded",
          path: relativePath,
          message: `${entries.length} entries`,
        },
      };
    },
  }),
  buildTool({
    name: "write_file",
    displayName: "Write",
    description: "Write a UTF-8 file inside the selected project root.",
    inputSchema: WriteFileActionSchema,
    concurrencySafe: false,
    destructive: (input) => Boolean(input.overwrite),
    run(input, context) {
      if (input.overwrite) {
        const freshness = context.fileStateCache?.checkFreshForWrite(context.root, input.path);
        if (freshness && !freshness.fresh) {
          throw new Error(`refusing stale write: ${freshness.reason}`);
        }
      }
      const target = writeFile(context.root, input.path, actionContent(input), Boolean(input.overwrite));
      context.fileStateCache?.rememberRead(context.root, input.path);
      return {
        result: {
          action_type: input.type,
          status: "succeeded",
          path: target,
          artifact_kind: artifactKindFromPath(input.path),
        },
      };
    },
  }),
  buildTool({
    name: "glob_files",
    displayName: "Glob",
    description: "Find project files by a wildcard pattern such as **/*.ts.",
    inputSchema: GlobFilesActionSchema,
    readOnly: true,
    concurrencySafe: true,
    run(input, context) {
      const matches = globFiles(context.root, input.path ?? "", input.pattern, input.max_results ?? 200);
      return {
        data: { matches },
        result: {
          action_type: input.type,
          status: "succeeded",
          path: input.path ?? "",
          message: matches.join("\n") || "no matches",
        },
      };
    },
  }),
  buildTool({
    name: "grep_files",
    displayName: "Grep",
    description: "Search text in project files with an optional include wildcard.",
    inputSchema: GrepFilesActionSchema,
    readOnly: true,
    concurrencySafe: true,
    run(input, context) {
      const matches = grepFiles(
        context.root,
        input.path ?? "",
        input.pattern,
        input.include,
        input.max_results ?? 100,
      );
      return {
        data: { matches },
        result: {
          action_type: input.type,
          status: "succeeded",
          path: input.path ?? "",
          message: matches.map((match) => `${match.path}:${match.line}: ${match.text}`).join("\n") || "no matches",
        },
      };
    },
  }),
  buildTool({
    name: "apply_patch",
    displayName: "Patch",
    description: "Apply exact search/replace edits to a project file.",
    inputSchema: ApplyPatchActionSchema,
    concurrencySafe: false,
    destructive: true,
    run(input, context) {
      const freshness = context.fileStateCache?.checkFresh(context.root, input.path);
      if (freshness && !freshness.fresh) {
        throw new Error(`refusing stale patch: ${freshness.reason}`);
      }
      const target = applyTextPatch(context.root, input.path, input.edits);
      context.fileStateCache?.rememberRead(context.root, input.path);
      return {
        result: {
          action_type: input.type,
          status: "succeeded",
          path: target,
          message: `${input.edits.length} edits`,
          artifact_kind: artifactKindFromPath(input.path),
        },
      };
    },
  }),
  buildTool({
    name: "run_command",
    displayName: "Bash",
    description: "Run a shell command in the project after explicit shell permission. On Windows this uses PowerShell, not cmd.exe.",
    inputSchema: RunCommandActionSchema,
    concurrencySafe: false,
    destructive: true,
    permissions(_input, context) {
      if (!context.allowShell) {
        return {
          behavior: "deny",
          message: "Shell execution is disabled. Start with --allow-shell or run /shell on.",
        };
      }
      return { behavior: "allow" };
    },
    async run(input, context) {
      const output = await runCommand(context.root, input.command, input.cwd ?? "", input.timeout_ms ?? 30_000, {
        ...defaultShellPolicy,
        allowShell: context.allowShell,
      }, {
        signal: context.abortSignal,
      });
      return {
        data: output,
        result: {
          action_type: input.type,
          status: output.exitCode === 0 && !output.timedOut ? "succeeded" : "failed",
          path: output.cwd,
          message: summarizeCommand(output),
        },
      };
    },
  }),
  buildTool({
    name: "ssh_run",
    displayName: "SSH",
    description: "Run a command on a configured SSH profile after explicit shell permission.",
    inputSchema: SshRunActionSchema,
    concurrencySafe: false,
    destructive: true,
    permissions(_input, context) {
      if (!context.allowShell) {
        return {
          behavior: "deny",
          message: "SSH execution is disabled. Start with --allow-shell, /shell on, or /permissions profile dev.",
        };
      }
      return { behavior: "allow" };
    },
    async run(input, context) {
      const service = new SshProfileService(context.root);
      const profile = service.getProfile(input.profile);
      if (!profile) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            path: input.profile,
            message: `SSH profile not found: ${input.profile}`,
          },
        };
      }
      const output = await runSshCommand(profile, input.command, {
        allowShell: context.allowShell,
        timeoutMs: input.timeout_ms,
        maxOutputChars: defaultShellPolicy.maxOutputChars,
        signal: context.abortSignal,
      });
      service.recordCommand(profile.name, output);
      return {
        data: output,
        result: {
          action_type: input.type,
          status: output.exitCode === 0 && !output.timedOut ? "succeeded" : "failed",
          path: profile.name,
          message: summarizeSshCommand(output),
        },
      };
    },
  }),
  buildTool({
    name: "ssh_read_file",
    displayName: "SSH Read",
    description: "Read a UTF-8 text file from a configured SSH profile after explicit shell permission.",
    inputSchema: SshReadFileActionSchema,
    readOnly: true,
    concurrencySafe: false,
    permissions(_input, context) {
      if (!context.allowShell) {
        return {
          behavior: "deny",
          message: "SSH file access is disabled. Start with --allow-shell, /shell on, or /permissions profile dev.",
        };
      }
      return { behavior: "allow" };
    },
    async run(input, context) {
      const service = new SshProfileService(context.root);
      const profile = service.getProfile(input.profile);
      if (!profile) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            path: input.profile,
            message: `SSH profile not found: ${input.profile}`,
          },
        };
      }
      const result = await readRemoteTextFile(profile, input.path, {
        allowShell: context.allowShell,
        timeoutMs: input.timeout_ms,
        maxOutputChars: defaultShellPolicy.maxOutputChars,
        signal: context.abortSignal,
      });
      service.recordCommand(profile.name, result.output);
      return {
        data: { content: result.content, bytes: result.bytes, target: result.target },
        result: {
          action_type: input.type,
          status: "succeeded",
          path: `${profile.name}:${result.remotePath}`,
          message: `${result.bytes} bytes from ${result.target}`,
        },
      };
    },
  }),
  buildTool({
    name: "ssh_write_file",
    displayName: "SSH Write",
    description: "Write a UTF-8 text file to a configured SSH profile after explicit shell permission.",
    inputSchema: SshWriteFileActionSchema,
    concurrencySafe: false,
    destructive: true,
    permissions(_input, context) {
      if (!context.allowShell) {
        return {
          behavior: "deny",
          message: "SSH file access is disabled. Start with --allow-shell, /shell on, or /permissions profile dev.",
        };
      }
      return { behavior: "allow" };
    },
    async run(input, context) {
      const service = new SshProfileService(context.root);
      const profile = service.getProfile(input.profile);
      if (!profile) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            path: input.profile,
            message: `SSH profile not found: ${input.profile}`,
          },
        };
      }
      const result = await writeRemoteTextFile(profile, input.path, actionContent(input), {
        allowShell: context.allowShell,
        timeoutMs: input.timeout_ms,
        maxOutputChars: defaultShellPolicy.maxOutputChars,
        overwrite: input.overwrite,
        signal: context.abortSignal,
      });
      service.recordCommand(profile.name, result.output);
      return {
        data: { bytes: result.bytes, target: result.target },
        result: {
          action_type: input.type,
          status: "succeeded",
          path: `${profile.name}:${result.remotePath}`,
          message: `${result.bytes} bytes to ${result.target}`,
        },
      };
    },
  }),
  buildTool({
    name: "mcp_call",
    displayName: "MCP",
    description: "Call a configured stdio MCP server tool after explicit shell permission.",
    inputSchema: McpCallActionSchema,
    concurrencySafe: false,
    destructive: false,
    permissions(input, context) {
      const service = new McpService(context.root);
      let requiresShell = true;
      try {
        requiresShell = service.requiresShell(input.server);
      } catch {
        requiresShell = false;
      }
      if (requiresShell && !context.allowShell) {
        return {
          behavior: "deny",
          message: "MCP stdio calls require shell execution. Start with --allow-shell or run /shell on.",
        };
      }
      return { behavior: "allow" };
    },
    async run(input, context) {
      const service = new McpService(context.root);
      const output = await service.callTool(input.server, input.tool, input.arguments ?? {}, {
        allowShell: context.allowShell,
        timeoutMs: input.timeout_ms,
        signal: context.abortSignal,
      });
      return {
        data: output,
        result: {
          action_type: input.type,
          status: "succeeded",
          path: input.server,
          message: JSON.stringify(output.result, null, 2),
        },
      };
    },
  }),
  buildTool({
    name: "TodoWrite",
    displayName: "TodoWrite",
    description: "Update the structured todo list for the current DeepSeekCode project/session.",
    inputSchema: TodoWriteActionSchema,
    concurrencySafe: false,
    destructive: false,
    run(input, context) {
      const result = new TodoService(context.root).writeTodos(input.todos, input.scope);
      return {
        data: {
          oldTodos: result.oldTodos,
          newTodos: result.newTodos,
          storedTodos: result.storedTodos,
          cleared: result.cleared,
        },
        result: {
          action_type: input.type,
          status: "succeeded",
          path: result.scope,
          message: result.cleared
            ? "All todos completed; todo list cleared."
            : [
                `todos ${result.scope}: total=${result.summary.total} pending=${result.summary.pending} in_progress=${result.summary.inProgress} completed=${result.summary.completed}`,
                formatTodoList(result.storedTodos),
              ].join("\n"),
        },
      };
    },
  }),
  buildTool({
    name: "EnterPlanMode",
    displayName: "Plan",
    description: "Create a DeepSeekCode implementation plan draft for the current run before editing code.",
    inputSchema: EnterPlanModeActionSchema,
    concurrencySafe: false,
    destructive: false,
    run(input, context) {
      if (!context.state || !(input.run_id || context.runId)) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            message: "EnterPlanMode requires a run context.",
          },
        };
      }
      const runId = input.run_id ?? context.runId!;
      const record = new PlanModeService(context.root, context.state).enter(runId, input.goal ?? "");
      return {
        data: record,
        result: {
          action_type: input.type,
          status: "succeeded",
          path: record.relativePath,
          message: [
            "Entered plan mode. Explore the codebase and write the implementation plan before editing code.",
            `plan=${record.relativePath}`,
          ].join("\n"),
        },
      };
    },
  }),
  buildTool({
    name: "AskUserQuestion",
    displayName: "Question",
    description: "Ask the user bounded multiple-choice clarification questions and pause the current run.",
    inputSchema: AskUserQuestionActionSchema,
    concurrencySafe: false,
    destructive: false,
    run(input, context) {
      if (!context.state || !(input.run_id || context.runId)) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            message: "AskUserQuestion requires a run context.",
          },
        };
      }
      const runId = input.run_id ?? context.runId!;
      const record = new QuestionService(context.root, context.state).request(runId, input.questions);
      return {
        data: record,
        result: {
          action_type: input.type,
          status: "failed",
          message: [
            "Question awaiting user answer.",
            formatQuestionRecord(record, { includeIds: false }),
            "Waiting for your answer in the permission panel.",
          ].join("\n"),
        },
      };
    },
  }),
  buildTool({
    name: "ExitPlanMode",
    displayName: "Plan Approval",
    description: "Save an implementation plan and request user approval before continuing.",
    inputSchema: ExitPlanModeActionSchema,
    concurrencySafe: false,
    destructive: false,
    run(input, context) {
      if (!context.state || !(input.run_id || context.runId)) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            message: "ExitPlanMode requires a run context.",
          },
        };
      }
      const runId = input.run_id ?? context.runId!;
      const record = new PlanModeService(context.root, context.state).exit(runId, input.plan, input.summary ?? "");
      return {
        data: record,
        result: {
          action_type: input.type,
          status: "failed",
          path: record.relativePath,
          message: `Approval required: plan ${record.relativePath}. Waiting for your approval in the permission panel.`,
        },
      };
    },
  }),
  buildTool({
    name: "validate_artifact",
    displayName: "Validate",
    description: "Validate a generated file artifact and report user-visible issues.",
    inputSchema: ValidateArtifactActionSchema,
    readOnly: true,
    concurrencySafe: true,
    run(input, context) {
      const report = validateArtifact(context.root, input.path, input.expected_kind);
      return {
        data: report,
        result: {
          action_type: input.type,
          status: report.errors.length === 0 ? "succeeded" : "failed",
          path: report.path,
          message: summarizeValidation(report),
          artifact_kind: report.kind,
        },
      };
    },
  }),
  buildTool({
    name: "browser_session_start",
    displayName: "Browser",
    description: "Start a browser session for a declared URL after explicit browser permission.",
    inputSchema: BrowserSessionStartActionSchema,
    concurrencySafe: false,
    destructive: false,
    permissions(_input, context) {
      if (!context.allowBrowser) {
        return {
          behavior: "deny",
          message: "Browser control is disabled. Start with --allow-browser or run /browser on.",
        };
      }
      return { behavior: "allow" };
    },
    run(input, context) {
      try {
        const message = startBrowserSession(input.url, input.visible ?? true, {
          allowBrowser: context.allowBrowser,
          dataDir: context.dataDir,
        });
        recordBrowserTool(context.dataDir, {
          action: "open",
          url: input.url,
          status: "succeeded",
          message,
        });
        return {
          result: {
            action_type: input.type,
            status: "succeeded",
            path: input.url,
            message,
          },
        };
      } catch (error) {
        recordBrowserTool(context.dataDir, {
          action: "open",
          url: input.url,
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
  buildTool({
    name: "browser_snapshot",
    displayName: "Snapshot",
    description: "Capture a text snapshot of a URL through a configured Chrome CDP session.",
    inputSchema: BrowserSnapshotActionSchema,
    readOnly: true,
    concurrencySafe: false,
    permissions(_input, context) {
      if (!context.allowBrowser) {
        return {
          behavior: "deny",
          message: "Browser control is disabled. Start with --allow-browser or run /browser on.",
        };
      }
      return { behavior: "allow" };
    },
    async run(input, context) {
      try {
        const snapshot = await captureBrowserSnapshot(input.url);
        recordBrowserTool(context.dataDir, {
          action: "snapshot",
          url: input.url,
          finalUrl: snapshot.url,
          status: "succeeded",
          title: snapshot.title,
          textChars: snapshot.text.length,
          message: `title: ${snapshot.title}`,
        });
        return {
          data: snapshot,
          result: {
            action_type: input.type,
            status: "succeeded",
            path: snapshot.url,
            message: [`title: ${snapshot.title}`, snapshot.text.slice(0, 4000)].join("\n"),
          },
        };
      } catch (error) {
        recordBrowserTool(context.dataDir, {
          action: "snapshot",
          url: input.url,
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
  buildTool({
    name: "browser_screenshot",
    displayName: "Screenshot",
    description: "Capture a PNG screenshot of a URL through a configured Chrome CDP session.",
    inputSchema: BrowserScreenshotActionSchema,
    concurrencySafe: false,
    permissions(_input, context) {
      if (!context.allowBrowser) {
        return {
          behavior: "deny",
          message: "Browser control is disabled. Start with --allow-browser or run /browser on.",
        };
      }
      return { behavior: "allow" };
    },
    async run(input, context) {
      const target = safeJoin(context.root, input.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      try {
        const bytes = await captureBrowserScreenshot(input.url, input.full_page ?? false);
        fs.writeFileSync(target, bytes);
        recordBrowserTool(context.dataDir, {
          action: "screenshot",
          url: input.url,
          path: input.path,
          status: "succeeded",
          bytes: bytes.length,
          message: `${bytes.length} bytes`,
        });
        return {
          result: {
            action_type: input.type,
            status: "succeeded",
            path: input.path,
            message: `${bytes.length} bytes`,
            artifact_kind: "screenshot",
          },
        };
      } catch (error) {
        recordBrowserTool(context.dataDir, {
          action: "screenshot",
          url: input.url,
          path: input.path,
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
  buildTool({
    name: "browser_click",
    displayName: "Click",
    description: "Click a CSS selector in a URL through a configured Chrome CDP session.",
    inputSchema: BrowserClickActionSchema,
    concurrencySafe: false,
    permissions(_input, context) {
      if (!context.allowBrowser) {
        return {
          behavior: "deny",
          message: "Browser control is disabled. Start with --allow-browser or run /browser on.",
        };
      }
      return { behavior: "allow" };
    },
    async run(input, context) {
      try {
        const status = await clickBrowserSelector(input.url, input.selector);
        recordBrowserTool(context.dataDir, {
          action: "click",
          url: input.url,
          selector: input.selector,
          status: status === "clicked" ? "succeeded" : "failed",
          message: status,
        });
        return {
          result: {
            action_type: input.type,
            status: status === "clicked" ? "succeeded" : "failed",
            path: input.url,
            message: `${status}: ${input.selector}`,
          },
        };
      } catch (error) {
        recordBrowserTool(context.dataDir, {
          action: "click",
          url: input.url,
          selector: input.selector,
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
  buildTool({
    name: "browser_type",
    displayName: "Type",
    description: "Type into a CSS selector in a URL through a configured Chrome CDP session.",
    inputSchema: BrowserTypeActionSchema,
    concurrencySafe: false,
    permissions(_input, context) {
      if (!context.allowBrowser) {
        return {
          behavior: "deny",
          message: "Browser control is disabled. Start with --allow-browser or run /browser on.",
        };
      }
      return { behavior: "allow" };
    },
    async run(input, context) {
      try {
        const status = await typeBrowserSelector(input.url, input.selector, input.text);
        recordBrowserTool(context.dataDir, {
          action: "type",
          url: input.url,
          selector: input.selector,
          status: status === "typed" ? "succeeded" : "failed",
          message: `${status}; textChars=${input.text.length}`,
        });
        return {
          result: {
            action_type: input.type,
            status: status === "typed" ? "succeeded" : "failed",
            path: input.url,
            message: `${status}: ${input.selector}`,
          },
        };
      } catch (error) {
        recordBrowserTool(context.dataDir, {
          action: "type",
          url: input.url,
          selector: input.selector,
          status: "failed",
          message: `${error instanceof Error ? error.message : String(error)}; textChars=${input.text.length}`,
        });
        throw error;
      }
    },
  }),
  buildTool({
    name: "invoke_agent",
    displayName: "Agent",
    description: "Load a named DeepSeekCode agent prompt for delegated work.",
    inputSchema: InvokeAgentActionSchema,
    readOnly: true,
    concurrencySafe: true,
    run(input, context) {
      const agent = loadAgent(context.root, context.dataDir ?? context.root, input.name);
      if (!agent) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            message: `agent not found: ${input.name}`,
          },
        };
      }
      const excerpt = agent.prompt.slice(0, 4000);
      return {
        data: { agent, task: input.task, prompt: excerpt },
        result: {
          action_type: input.type,
          status: "succeeded",
          path: agent.path,
          message: [
            `agent ${agent.scope}/${agent.name} loaded for task: ${input.task}`,
            `model: ${agent.model}`,
            agent.tools?.length ? `tools: ${agent.tools.join(", ")}` : "tools: inherited",
            excerpt,
          ].join("\n"),
        },
      };
    },
  }),
  buildTool({
    name: "invoke_skill",
    displayName: "Skill",
    description: "Execute a named DeepSeekCode or Claude-style SKILL.md skill in a forked local agent context.",
    inputSchema: InvokeSkillActionSchema,
    concurrencySafe: false,
    destructive: true,
    async run(input, context) {
      if (context.skillRunner) {
        const output = await context.skillRunner({
          name: input.name,
          task: input.task,
          maxTurns: input.max_turns,
        });
        const childSummary = output.execution.results
          .map((result) => `${result.action_type}:${result.status}${result.path ? ` ${result.path}` : ""}`)
          .join("\n");
        return {
          data: output,
          result: {
            action_type: input.type,
            status: output.execution.status,
            path: output.skill.path,
            message: [
              `skill ${output.skill.scope}/${output.skill.name} executed in ${output.turnCount} turn(s) for task: ${input.task}`,
              output.execution.final_message,
              childSummary,
            ].filter(Boolean).join("\n"),
          },
        };
      }
      const skill = loadSkill(context.root, context.dataDir ?? context.root, input.name);
      if (!skill) {
        return {
          result: {
            action_type: input.type,
            status: "failed",
            message: `skill not found: ${input.name}`,
          },
        };
      }
      const excerpt = skill.prompt.slice(0, 4000);
      return {
        data: { skill, task: input.task, prompt: excerpt },
        result: {
          action_type: input.type,
          status: "succeeded",
          path: skill.path,
          message: [
            `skill ${skill.scope}/${skill.name} loaded for task: ${input.task}`,
            excerpt,
          ].join("\n"),
        },
      };
    },
  }),
  buildTool({
    name: "create_docx",
    displayName: "DOCX",
    description: "Create a real DOCX artifact from Markdown using the runtime document tool; do not write helper scripts.",
    inputSchema: PlannedDocxActionSchema,
    destructive: true,
    async run(input, context) {
      const target = await createDocxArtifact(context.root, input);
      return {
        result: {
          action_type: input.type,
          status: "succeeded",
          path: target,
          message: "DOCX created by runtime document tool",
          artifact_kind: "docx",
        },
      };
    },
  }),
  buildTool({
    name: "create_pptx",
    displayName: "PPTX",
    description: "Create a real PPTX artifact from structured slide content using the runtime presentation tool; do not write helper scripts.",
    inputSchema: PlannedPptxActionSchema,
    destructive: true,
    async run(input, context) {
      const target = await createPptxArtifact(context.root, input);
      return {
        result: {
          action_type: input.type,
          status: "succeeded",
          path: target,
          message: `PPTX created by runtime presentation tool with ${input.slides.length + 1} slides`,
          artifact_kind: "pptx",
        },
      };
    },
  }),
  buildTool({
    name: "create_pdf",
    displayName: "PDF",
    description: "Reserved PDF-generation action. It fails honestly until the document bridge is wired.",
    inputSchema: PlannedPdfActionSchema,
    destructive: true,
    run(input) {
      return {
        result: {
          action_type: input.type,
          status: "failed",
          path: input.path,
          message: "create_pdf is in the protocol; the TypeScript document bridge is not wired yet.",
          artifact_kind: "pdf",
        },
      };
    },
  }),
  buildTool({
    name: "computer_use",
    displayName: "Computer",
    description: "Reserved computer-use action. It stays disabled until explicit bridge permissions exist.",
    inputSchema: PlannedComputerUseActionSchema,
    destructive: true,
    permissions() {
      return {
        behavior: "deny",
        message: "computer_use requires a future explicit computer bridge permission.",
      };
    },
    run(input) {
      return {
        result: {
          action_type: input.type,
          status: "failed",
          message: "computer_use is not enabled in this TypeScript runtime yet.",
        },
      };
    },
  }),
];

function actionContent(input: { content?: string; content_lines?: string[] }): string {
  if (typeof input.content === "string") return input.content;
  if (Array.isArray(input.content_lines)) return input.content_lines.join("\n");
  throw new Error("write action requires content or content_lines");
}

function recordBrowserTool(
  dataDir: string | undefined,
  input: {
    action: "open" | "snapshot" | "screenshot" | "click" | "type";
    url: string;
    status: "succeeded" | "failed";
    message?: string;
    finalUrl?: string;
    selector?: string;
    path?: string;
    title?: string;
    bytes?: number;
    textChars?: number;
  },
): void {
  if (!dataDir) return;
  new BrowserTrajectoryRecorder(dataDir).record({
    ...input,
    source: "tool",
  });
}
