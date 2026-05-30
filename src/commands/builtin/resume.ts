import React from "react";
import {
  SessionPanel,
  sessionFocusPanelModel,
  sessionResumePanelModel,
} from "../../components/SessionPanel.js";
import type { Command } from "../../types/command.js";
import { getSessionTags, getSessionTitle } from "../../services/session/sessionMetadata.js";
import {
  clearCurrentSession,
  formatResumeSessionPreview,
  getCurrentSessionId,
  resumeSession,
} from "../../services/session/resumeService.js";

export const resumeCommand: Command = {
  name: "resume",
  description: "Resume a persisted local transcript session by setting session focus.",
  usage: "<session-id>|current|clear",
  execute(args, context) {
    const mode = args.trim();
    if (mode === "current") {
      const current = getCurrentSessionId(context.state, context.config.projectPath);
      return {
        message: current ? `current session: ${current}` : "No resumed session.",
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
    if (mode === "clear") {
      const current = getCurrentSessionId(context.state, context.config.projectPath);
      clearCurrentSession(context.state, context.config.projectPath);
      return {
        message: "current session cleared.",
        display: React.createElement(SessionPanel, {
          model: sessionFocusPanelModel({
            sessionId: current,
            action: "cleared",
            title: current ? getSessionTitle(context.config.dataDir, current) : undefined,
            tags: current ? getSessionTags(context.config.dataDir, current) : undefined,
          }),
        }),
      };
    }
    if (!mode) return { message: "Usage: /resume <session-id>|current|clear" };
    try {
      const preview = resumeSession(
        context.state,
        context.config.dataDir,
        context.config.projectPath,
        mode,
      );
      return {
        message: formatResumeSessionPreview(preview),
        display: React.createElement(SessionPanel, { model: sessionResumePanelModel(preview) }),
      };
    } catch (error) {
      return { message: error instanceof Error ? error.message : String(error) };
    }
  },
};
