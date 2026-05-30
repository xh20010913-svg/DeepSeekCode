import React from "react";
import { SessionPanel, sessionMetadataPanelModel } from "../../components/SessionPanel.js";
import type { Command } from "../../types/command.js";
import { getCurrentSessionId } from "../../services/session/resumeService.js";
import { setSessionTitle } from "../../services/session/sessionMetadata.js";

export const renameCommand: Command = {
  name: "rename",
  description: "Assign a human-readable title to a session transcript.",
  usage: "[session-id] <title>",
  execute(args, context) {
    const parts = parseArgs(args);
    if (parts.length === 0) return { message: "Usage: /rename [session-id] <title>" };
    const current = getCurrentSessionId(context.state, context.config.projectPath);
    const [sessionId, title] = parts.length === 1
      ? [current, parts[0]]
      : [parts[0], parts.slice(1).join(" ")];
    if (!sessionId) return { message: "No current session. Use /rename <session-id> <title> or /resume <session-id> first." };
    if (!title.trim()) return { message: "Usage: /rename [session-id] <title>" };
    const record = setSessionTitle(context.config.dataDir, sessionId, title);
    return {
      message: `session ${record.sessionId} renamed: ${record.title}`,
      display: React.createElement(SessionPanel, { model: sessionMetadataPanelModel(record, "renamed") }),
    };
  },
};

function parseArgs(args: string): string[] {
  return [...args.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? "",
  );
}
