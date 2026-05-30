import React from "react";
import type { Command } from "../../types/command.js";
import { SessionStorage } from "../../services/session/sessionStorage.js";
import { getCurrentSessionId } from "../../services/session/resumeService.js";
import { listSessionTitles } from "../../services/session/sessionMetadata.js";
import { compactPath } from "../format.js";
import { SessionPanel, sessionListPanelModel, sessionTranscriptPanelModel } from "../../components/SessionPanel.js";

export const sessionsCommand: Command = {
  name: "sessions",
  description: "List local transcript session files.",
  usage: "[show <session-id>]",
  execute(args, context) {
    const trimmed = args.trim();
    if (trimmed.startsWith("show ")) {
      const sessionId = trimmed.slice("show ".length).trim();
      const storage = new SessionStorage(context.config.dataDir, sessionId);
      const records = storage.readAll(80);
      if (records.length === 0) {
        return {
          message: `No transcript records for ${sessionId}.`,
          display: React.createElement(SessionPanel, { model: sessionTranscriptPanelModel(sessionId, records) }),
        };
      }
      return {
        message: records.map((record) => `${record.role}: ${record.text}`).join("\n"),
        display: React.createElement(SessionPanel, { model: sessionTranscriptPanelModel(sessionId, records) }),
      };
    }
    const sessions = SessionStorage.list(context.config.dataDir, 20);
    const titles = listSessionTitles(context.config.dataDir);
    const current = getCurrentSessionId(context.state, context.config.projectPath);
    if (sessions.length === 0) {
      return {
        message: "No persisted sessions yet.",
        display: React.createElement(SessionPanel, { model: sessionListPanelModel(sessions, titles, current) }),
      };
    }
    return {
      message: sessions
        .map((session) => {
          const marker = session.sessionId === current ? "*" : "-";
          const metadata = titles[session.sessionId];
          const tags = metadata?.tags?.length ? ` ${metadata.tags.map((tag) => `#${tag}`).join(" ")}` : "";
          return `${marker} ${session.sessionId} ${metadata?.title ? `"${metadata.title}" ` : ""}${Math.round(session.bytes / 1024)}KB${tags} ${compactPath(session.path, 72)}`;
        })
        .join("\n"),
      display: React.createElement(SessionPanel, { model: sessionListPanelModel(sessions, titles, current) }),
    };
  },
};
