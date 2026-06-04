import type { Command } from "../types/command.js";
import type { CommandContext } from "../types/command.js";
import { addDirCommand } from "./builtin/addDir.js";
import { agentsCommand } from "./builtin/agents.js";
import { attachCommand } from "./builtin/attach.js";
import { approvalCommand } from "./builtin/approval.js";
import { bridgeCommand } from "./builtin/bridge.js";
import { branchCommand } from "./builtin/branch.js";
import { browserCommand } from "./builtin/browser.js";
import { btwCommand } from "./builtin/btw.js";
import { cacheCommand } from "./builtin/cache.js";
import { clearCommand } from "./builtin/clear.js";
import { cmdCommand } from "./builtin/cmd.js";
import { compactCommand } from "./builtin/compact.js";
import { configCommand } from "./builtin/config.js";
import { contextCommand } from "./builtin/context.js";
import { costCommand } from "./builtin/cost.js";
import { diagCommand } from "./builtin/diag.js";
import { diffCommand } from "./builtin/diff.js";
import { doctorCommand } from "./builtin/doctor.js";
import { effortCommand } from "./builtin/effort.js";
import { eventsCommand } from "./builtin/events.js";
import { exportCommand } from "./builtin/export.js";
import { filesCommand } from "./builtin/files.js";
import { createHelpCommand } from "./builtin/help.js";
import { hooksCommand } from "./builtin/hooks.js";
import { initCommand } from "./builtin/init.js";
import { languageCommand } from "./builtin/language.js";
import { logsCommand } from "./builtin/logs.js";
import { memoryCommand } from "./builtin/memory.js";
import { mcpCommand } from "./builtin/mcp.js";
import { modelCommand } from "./builtin/model.js";
import { multiCommand } from "./builtin/multi.js";
import { outputStyleCommand } from "./builtin/outputStyle.js";
import { planCommand } from "./builtin/plan.js";
import { permissionsCommand } from "./builtin/permissions.js";
import { pluginsCommand } from "./builtin/plugins.js";
import { projectCommand } from "./builtin/project.js";
import { questionCommand } from "./builtin/question.js";
import { queueCommand } from "./builtin/queue.js";
import { quitCommand } from "./builtin/quit.js";
import { renameCommand } from "./builtin/rename.js";
import { remoteControlCommand } from "./builtin/remoteControl.js";
import { resumeCommand as resumeSessionCommand } from "./builtin/resume.js";
import { rewindCommand } from "./builtin/rewind.js";
import { reviewCommand, securityReviewCommand } from "./builtin/review.js";
import { cancelCommand, pauseCommand, resumeCommand as resumeRunCommand, retryCommand } from "./builtin/runControl.js";
import { runsCommand } from "./builtin/runs.js";
import { sessionsCommand } from "./builtin/sessions.js";
import { settingsCommand } from "./builtin/settings.js";
import { shellCommand } from "./builtin/shell.js";
import { skillsCommand } from "./builtin/skills.js";
import { sshCommand } from "./builtin/ssh.js";
import { statsCommand } from "./builtin/stats.js";
import { statusCommand } from "./builtin/status.js";
import { tagCommand } from "./builtin/tag.js";
import { tasksCommand } from "./builtin/tasks.js";
import { themeCommand } from "./builtin/theme.js";
import { todoCommand, todosCommand } from "./builtin/todos.js";
import { toolsCommand } from "./builtin/tools.js";
import { traceCommand } from "./builtin/trace.js";
import { usageCommand } from "./builtin/usage.js";
import { validationCommand } from "./builtin/validation.js";
import { versionCommand } from "./builtin/version.js";
import { discoverPluginCommands } from "../plugins/commands.js";
import { discoverUserCommands } from "./userCommands.js";

export function buildCommandCatalog(context?: CommandContext): Command[] {
  const commands: Command[] = [
    doctorCommand,
    versionCommand,
    initCommand,
    addDirCommand,
    modelCommand,
    languageCommand,
    effortCommand,
    projectCommand,
    configCommand,
    statusCommand,
    btwCommand,
    branchCommand,
    exportCommand,
    attachCommand,
    runsCommand,
    queueCommand,
    remoteControlCommand,
    pauseCommand,
    resumeRunCommand,
    cancelCommand,
    retryCommand,
    resumeSessionCommand,
    settingsCommand,
    renameCommand,
    rewindCommand,
    planCommand,
    questionCommand,
    todosCommand,
    todoCommand,
    tasksCommand,
    tagCommand,
    eventsCommand,
    traceCommand,
    sessionsCommand,
    compactCommand,
    contextCommand,
    filesCommand,
    diffCommand,
    reviewCommand,
    securityReviewCommand,
    permissionsCommand,
    themeCommand,
    outputStyleCommand,
    toolsCommand,
    cmdCommand,
    shellCommand,
    sshCommand,
    browserCommand,
    agentsCommand,
    hooksCommand,
    skillsCommand,
    pluginsCommand,
    logsCommand,
    memoryCommand,
    mcpCommand,
    cacheCommand,
    costCommand,
    usageCommand,
    statsCommand,
    approvalCommand,
    validationCommand,
    bridgeCommand,
    diagCommand,
    multiCommand,
    clearCommand,
    quitCommand,
  ];
  const pluginCommands = context
    ? discoverPluginCommands(context.config.projectPath, context.config.dataDir)
    : [];
  const userCommands = context
    ? discoverUserCommands(context.config.projectPath, context.config.dataDir)
    : [];
  return [createHelpCommand(() => buildCommandCatalog(context)), ...commands, ...userCommands, ...pluginCommands];
}
