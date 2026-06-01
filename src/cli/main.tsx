#!/usr/bin/env node
import React from "react";
import { Command } from "commander";
import { render } from "ink";
import { bootstrapConfig } from "../bootstrap/config.js";
import { Workbench } from "../components/Workbench.js";
import { enterTerminalScreen, restoreTerminalScreen } from "../components/terminalScreen.js";
import { runSlashCommand } from "../commands/index.js";
import { QueryEngine, type QueryEvent } from "../query/QueryEngine.js";
import { DeepSeekClient } from "../services/deepseek/client.js";
import { StateStore } from "../state/sqlite.js";
import { resumeSession, setCurrentSessionId } from "../services/session/resumeService.js";
import { SessionStorage } from "../services/session/sessionStorage.js";

interface CliOptions {
  project?: string;
  dataDir?: string;
  model?: string;
  prompt?: string;
  resume?: string;
  continue?: boolean;
  doctor?: boolean;
  verifyModel?: boolean;
  allowShell?: boolean;
  allowBrowser?: boolean;
  permissionProfile?: string;
  json?: boolean;
}

const program = new Command()
  .name("deepseekcode")
  .description("DeepSeek-first local coding workbench")
  .option("--project <path>", "project path")
  .option("--data-dir <path>", "runtime data directory")
  .option("--model <model>", "DeepSeek model")
  .option("-p, --prompt <text>", "run one headless prompt")
  .option("--resume <session-id>", "resume a persisted local transcript session before running")
  .option("-c, --continue", "continue the most recent local transcript session before running")
  .option("--doctor", "print runtime diagnostics")
  .option("--verify-model", "verify DeepSeek model access")
  .option("--allow-shell", "allow shell tool execution")
  .option("--allow-browser", "allow browser bridge actions")
  .option("--permission-profile <profile>", "permission profile: safe, dev, browser, open")
  .option("--json", "print headless events as JSON lines");

program.parse(process.argv);
const options = program.opts<CliOptions>();
const config = bootstrapConfig({
  project: options.project,
  dataDir: options.dataDir,
  model: options.model,
  allowShell: options.allowShell,
  allowBrowser: options.allowBrowser,
  permissionProfile: options.permissionProfile,
});
const state = new StateStore(config.stateDbPath);
const provider = config.provider ? new DeepSeekClient(config.provider) : null;
selectHeadlessSession();

process.on("exit", () => {
  restoreTerminalScreen();
  try {
    state.close();
  } catch {
    // ignore shutdown races
  }
});

if (options.doctor) {
  const result = await runSlashCommand("/doctor", commandContext());
  print(result.message ?? "");
} else if (options.verifyModel) {
  const result = await runSlashCommand("/model verify", commandContext());
  print(result.message ?? "");
} else if (options.prompt) {
  await runHeadless(options.prompt, Boolean(options.json));
} else {
  const restore = enterTerminalScreen();
  try {
    await render(<Workbench config={config} state={state} provider={provider} />).waitUntilExit();
  } finally {
    restore();
  }
}

function commandContext() {
  return {
    config,
    state,
    provider,
    permissions: {
      allowShell: config.shellEnabled,
      allowBrowser: config.browserEnabled,
      profile: config.permissionProfile,
    },
  };
}

async function runHeadless(prompt: string, json: boolean): Promise<void> {
  const engine = new QueryEngine({
    config,
    state,
    provider,
    permissions: {
      allowShell: config.shellEnabled,
      allowBrowser: config.browserEnabled,
      profile: config.permissionProfile,
    },
    sessionPersistence: "managed",
  });
  let streamed = false;
  for await (const event of engine.submit(prompt)) {
    if (json) {
      print(JSON.stringify(serializeHeadlessEvent(event)));
      continue;
    }
    renderEvent(event, (value) => {
      streamed = value;
    }, streamed);
  }
  if (streamed) process.stdout.write("\n");
}

function selectHeadlessSession(): string | undefined {
  if (options.resume) {
    const preview = resumeSession(
      state,
      config.dataDir,
      config.projectPath,
      options.resume,
    );
    return preview.sessionId;
  }
  if (options.continue) {
    const latest = SessionStorage.list(config.dataDir, 1)[0];
    if (latest) {
      setCurrentSessionId(state, config.projectPath, latest.sessionId);
      state.appendEvent(null, "session_continued", {
        session_id: latest.sessionId,
        project_path: config.projectPath,
      });
      return latest.sessionId;
    }
  }
  return undefined;
}

function renderEvent(
  event: QueryEvent,
  setStreamed: (value: boolean) => void,
  streamed: boolean,
): void {
  if (event.type === "assistant_delta") {
    process.stdout.write(event.text);
    setStreamed(true);
    return;
  }
  if (event.type === "assistant") {
    if (!streamed) print(event.text);
    return;
  }
  if (event.type === "command" || event.type === "error") {
    print(event.text);
    return;
  }
  if (event.type === "command_display") {
    print(event.fallbackText ?? "[command display]");
  }
}

function print(text: string): void {
  process.stdout.write(`${text}\n`);
}

function serializeHeadlessEvent(event: QueryEvent): Record<string, unknown> {
  if (event.type === "command_display") {
    return { type: "command", text: event.fallbackText ?? "[command display]" };
  }
  return event as unknown as Record<string, unknown>;
}
