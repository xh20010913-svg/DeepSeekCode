import React from "react";
import { TokenBudgetWarning, buildTokenBudgetWarning } from "./TokenBudgetWarning.js";

export interface TokenWarningInput {
  tokenUsage: number;
  model: string;
  contextLimit?: number;
}

export function TokenWarning(props: TokenWarningInput): React.ReactElement | null {
  const model = buildTokenWarning(props);
  if (!model) return null;
  return <TokenBudgetWarning usedTokens={model.usedTokens} contextLimit={model.contextLimit} model={model.model} />;
}

export function buildTokenWarning(input: TokenWarningInput): {
  usedTokens: number;
  contextLimit: number;
  model: string;
} | null {
  const contextLimit = input.contextLimit ?? DEEPSEEKCODE_SOFT_CONTEXT_LIMIT;
  if (!Number.isFinite(input.tokenUsage) || input.tokenUsage < 0) return null;
  if (!buildTokenBudgetWarning({ usedTokens: input.tokenUsage, contextLimit, model: input.model })) return null;
  return {
    usedTokens: input.tokenUsage,
    contextLimit,
    model: input.model,
  };
}

export const DEEPSEEKCODE_SOFT_CONTEXT_LIMIT = 64_000;
