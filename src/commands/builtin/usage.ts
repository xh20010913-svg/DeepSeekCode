import React from "react";
import type { Command } from "../../types/command.js";
import { cacheRate } from "../../query/promptCache.js";
import { resolveRunId, stripRunAlias } from "../runSelection.js";
import { MetricsPanel, usagePanelModel } from "../../components/MetricsPanel.js";

export const usageCommand: Command = {
  name: "usage",
  description: "Show persisted token and DeepSeek cache usage totals.",
  usage: "[run-id|attached|current]",
  execute(args, context) {
    const trimmed = stripRunAlias(args.trim());
    const runId = trimmed ? resolveRunId(trimmed, context) : undefined;
    const usage = context.state.usageTotals(runId);
    const scope = runId ? `usage for ${runId}` : "usage totals";
    return {
      message: [
        scope,
        `snapshots=${usage.snapshots}`,
        `input=${usage.inputTokens}`,
        `output=${usage.outputTokens}`,
        `cacheHit=${usage.cacheHitTokens}`,
        `cacheMiss=${usage.cacheMissTokens}`,
        `cacheRate=${cacheRate(usage.cacheHitTokens, usage.cacheMissTokens)}`,
      ].join("\n"),
      display: React.createElement(MetricsPanel, { model: usagePanelModel(scope, usage) }),
    };
  },
};
