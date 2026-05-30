import React from "react";
import {
  SessionPanel,
  sessionFocusPanelModel,
  sessionListPanelModel,
  sessionMetadataPanelModel,
} from "../../components/SessionPanel.js";
import type { Command, CommandContext } from "../../types/command.js";
import { getCurrentSessionId } from "../../services/session/resumeService.js";
import { SessionStorage } from "../../services/session/sessionStorage.js";
import {
  getSessionTags,
  getSessionTitle,
  listSessionTitles,
  normalizeSessionTag,
  setSessionTags,
  toggleSessionTag,
} from "../../services/session/sessionMetadata.js";

export const tagCommand: Command = {
  name: "tag",
  description: "Toggle searchable tags on transcript sessions.",
  usage: "<tag>|list [tag]|set <session-id> <tag>|clear [session-id]|current",
  execute(args, context) {
    const tokens = splitArgs(args);
    const [mode = "", ...rest] = tokens;
    if (!mode || mode === "help" || mode === "--help") {
      return {
        message: "Usage: /tag <tag> | list [tag] | set <session-id> <tag> | clear [session-id] | current",
      };
    }

    if (mode === "current") {
      const current = currentOrLatestSession(context);
      return {
        message: current
          ? `current session: ${current}\ntags: ${formatTags(getSessionTags(context.config.dataDir, current))}`
          : "No current session.",
        display: React.createElement(SessionPanel, {
          model: sessionFocusPanelModel({
            sessionId: current,
            action: "current",
            title: current ? getSessionTitle(context.config.dataDir, current) : undefined,
            tags: current ? getSessionTags(context.config.dataDir, current) : undefined,
          }),
        }),
      };
    }

    if (mode === "list") {
      const filter = normalizeSessionTag(rest.join(" "));
      const sessions = SessionStorage.list(context.config.dataDir, 100);
      const metadata = listSessionTitles(context.config.dataDir);
      const current = getCurrentSessionId(context.state, context.config.projectPath);
      const rows = sessions
        .map((session) => {
          const tags = metadata[session.sessionId]?.tags ?? [];
          return { ...session, title: metadata[session.sessionId]?.title, tags };
        })
        .filter((session) => !filter || session.tags.includes(filter));
      const display = React.createElement(SessionPanel, {
        model: sessionListPanelModel(rows, metadata, current),
      });
      if (rows.length === 0) return { message: filter ? `No sessions tagged #${filter}.` : "No tagged sessions.", display };
      return {
        message: rows.map((session) => {
          const marker = session.sessionId === current ? "*" : "-";
          return `${marker} ${session.sessionId}${session.title ? ` "${session.title}"` : ""} ${formatTags(session.tags)}`;
        }).join("\n"),
        display,
      };
    }

    if (mode === "set") {
      const [sessionId, ...tagParts] = rest;
      if (!sessionId || tagParts.length === 0) return { message: "Usage: /tag set <session-id> <tag>" };
      const tag = normalizeSessionTag(tagParts.join(" "));
      if (!tag) return { message: "tag name cannot be empty" };
      const record = toggleSessionTag(context.config.dataDir, sessionId, tag);
      return {
        message: `${sessionId} tags: ${formatTags(record.tags ?? [])}`,
        display: React.createElement(SessionPanel, { model: sessionMetadataPanelModel(record, "tagged") }),
      };
    }

    if (mode === "clear") {
      const sessionId = rest[0] ?? currentOrLatestSession(context);
      if (!sessionId) return { message: "No current session to clear tags from." };
      const record = setSessionTags(context.config.dataDir, sessionId, []);
      return {
        message: `${record.sessionId} tags cleared.`,
        display: React.createElement(SessionPanel, { model: sessionMetadataPanelModel(record, "cleared") }),
      };
    }

    const sessionId = currentOrLatestSession(context);
    if (!sessionId) return { message: "No session to tag. Start chatting or /resume a session first." };
    const tag = normalizeSessionTag([mode, ...rest].join(" "));
    if (!tag) return { message: "tag name cannot be empty" };
    const before = getSessionTags(context.config.dataDir, sessionId);
    const record = toggleSessionTag(context.config.dataDir, sessionId, tag);
    const added = !before.includes(tag) && (record.tags ?? []).includes(tag);
    return {
      message: `${added ? "tagged" : "removed tag from"} ${sessionId}: #${tag}\ntags: ${formatTags(record.tags ?? [])}`,
      display: React.createElement(SessionPanel, {
        model: sessionMetadataPanelModel(record, added ? "tagged" : "cleared"),
      }),
    };
  },
};

function currentOrLatestSession(context: CommandContext): string | undefined {
  return (
    getCurrentSessionId(context.state, context.config.projectPath) ??
    SessionStorage.list(context.config.dataDir, 1)[0]?.sessionId
  );
}

function formatTags(tags: string[]): string {
  return tags.length ? tags.map((tag) => `#${tag}`).join(" ") : "(none)";
}

function splitArgs(input: string): string[] {
  return [...input.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? "",
  );
}
