import React from "react";
import type { Command } from "../../types/command.js";
import { CompactSummary, compactSummaryModel } from "../../components/CompactSummary.js";
import { compactSessionTranscript, formatSessionCompactSummary } from "../../services/compact/sessionCompact.js";
import { SessionStorage } from "../../services/session/sessionStorage.js";

export const compactCommand: Command = {
  name: "compact",
  description: "Create a local compact summary preview for a persisted session transcript.",
  usage: "[session-id] [keep-tail]",
  execute(args, context) {
    const [sessionArg = "", keepArg = ""] = args.trim().split(/\s+/).filter(Boolean);
    const sessionId = sessionArg || SessionStorage.list(context.config.dataDir, 1)[0]?.sessionId;
    if (!sessionId) return { message: "No persisted sessions to compact." };
    const keepTail = parseKeepTail(keepArg);
    const summary = compactSessionTranscript(context.config.dataDir, sessionId, keepTail);
    return {
      message: formatSessionCompactSummary(summary),
      display: React.createElement(CompactSummary, { model: compactSummaryModel(summary), width: 96 }),
    };
  },
};

function parseKeepTail(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 12;
  return Math.min(80, Math.floor(parsed));
}
