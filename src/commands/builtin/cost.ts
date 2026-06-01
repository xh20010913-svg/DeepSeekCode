import React from "react";
import type { Command } from "../../types/command.js";
import { getUsageTotals } from "../../cost-tracker.js";
import { estimateUsageCost, formatCostEstimate, priceConfigFromEnv } from "../../services/cost/costEstimate.js";
import { resolveRunId } from "../runSelection.js";
import { MetricsPanel, costPanelModel } from "../../components/MetricsPanel.js";

export const costCommand: Command = {
  name: "cost",
  description: "Show persisted or in-process DeepSeek token cost estimates.",
  usage: "[run-id|attached|current|process]",
  execute(args, context) {
    const trimmed = args.trim();
    const price = priceConfigFromEnv(process.env, context.config.model);
    if (trimmed === "process") {
      const totals = getUsageTotals();
      const estimate = estimateUsageCost({
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        cacheHitTokens: totals.cacheHitTokens,
        cacheMissTokens: totals.cacheMissTokens,
        snapshots: 0,
      }, price);
      return {
        message: formatCostEstimate("process", estimate),
        display: React.createElement(MetricsPanel, { model: costPanelModel("process", estimate) }),
      };
    }
    const runId = trimmed ? resolveRunId(trimmed, context) : undefined;
    if (trimmed && !runId) return { message: `Run not found: ${trimmed}` };
    const scope = runId ?? "all";
    const estimate = estimateUsageCost(context.state.usageTotals(runId), price);
    return {
      message: formatCostEstimate(
        scope,
        estimate,
      ),
      display: React.createElement(MetricsPanel, { model: costPanelModel(scope, estimate) }),
    };
  },
};
