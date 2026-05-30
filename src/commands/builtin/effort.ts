import React from "react";
import { BudgetPanel, budgetPanelModel } from "../../components/BudgetPanel.js";
import type { Command, CommandContext } from "../../types/command.js";
import {
  formatInferenceBudget,
  InferenceSettingsService,
  normalizeEffort,
} from "../../services/inference/inferenceSettingsService.js";

export const effortCommand: Command = {
  name: "effort",
  description: "Set DeepSeekCode prompt and output-token budget.",
  usage: "[low|medium|high|max|auto|status|path]",
  execute(args, context) {
    const service = new InferenceSettingsService(context.config.projectPath);
    const trimmed = args.trim().toLowerCase();
    if (!trimmed || trimmed === "status" || trimmed === "current") {
      const budget = service.effective();
      return {
        message: formatInferenceBudget(budget),
        display: React.createElement(BudgetPanel, {
          model: budgetPanelModel({
            budget,
            action: "status",
            path: service.path(),
            runtimeMaxOutputTokens: context.config.provider?.maxOutputTokens,
          }),
        }),
      };
    }
    if (trimmed === "path") {
      const budget = service.effective();
      return {
        message: service.path(),
        display: React.createElement(BudgetPanel, {
          model: budgetPanelModel({
            budget,
            action: "path",
            path: service.path(),
            runtimeMaxOutputTokens: context.config.provider?.maxOutputTokens,
          }),
        }),
      };
    }
    if (trimmed === "auto" || trimmed === "unset") {
      const budget = service.clear();
      applyRuntimeBudget(context, budget.maxOutputTokens);
      return {
        message: `effort reset to auto\n${formatInferenceBudget(budget)}`,
        display: React.createElement(BudgetPanel, {
          model: budgetPanelModel({
            budget,
            action: "auto",
            path: service.path(),
            runtimeMaxOutputTokens: context.config.provider?.maxOutputTokens,
          }),
        }),
      };
    }
    const level = normalizeEffort(trimmed);
    if (!level) {
      return { message: "Usage: /effort [low|medium|high|max|auto|status|path]" };
    }
    const budget = service.set(level);
    applyRuntimeBudget(context, budget.maxOutputTokens);
    return {
      message: `effort set to ${level}\n${formatInferenceBudget(budget)}`,
      display: React.createElement(BudgetPanel, {
        model: budgetPanelModel({
          budget,
          action: "set",
          path: service.path(),
          runtimeMaxOutputTokens: context.config.provider?.maxOutputTokens,
        }),
      }),
    };
  },
};

function applyRuntimeBudget(context: CommandContext, maxOutputTokens: number): void {
  if (context.config.provider) context.config.provider.maxOutputTokens = maxOutputTokens;
}
