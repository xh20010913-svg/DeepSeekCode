import { cacheRate } from "../../query/promptCache.js";
import type { UsageTotals } from "../../state/sqlite.js";

export interface TokenPriceConfig {
  currency: string;
  inputPerMillion?: number;
  outputPerMillion?: number;
  cacheHitPerMillion?: number;
  cacheMissPerMillion?: number;
}

export interface CostEstimate {
  usage: UsageTotals;
  price: TokenPriceConfig;
  inputCost?: number;
  outputCost?: number;
  totalCost?: number;
  estimatedCacheSavings?: number;
  configured: boolean;
}

export function priceConfigFromEnv(env: NodeJS.ProcessEnv = process.env): TokenPriceConfig {
  return {
    currency: env.DEEPSEEKCODE_PRICE_CURRENCY || "USD",
    inputPerMillion: optionalNumber(env.DEEPSEEKCODE_PRICE_INPUT_PER_M),
    outputPerMillion: optionalNumber(env.DEEPSEEKCODE_PRICE_OUTPUT_PER_M),
    cacheHitPerMillion: optionalNumber(env.DEEPSEEKCODE_PRICE_CACHE_HIT_PER_M),
    cacheMissPerMillion: optionalNumber(env.DEEPSEEKCODE_PRICE_CACHE_MISS_PER_M),
  };
}

export function estimateUsageCost(usage: UsageTotals, price: TokenPriceConfig): CostEstimate {
  const hasCacheSpecificRates =
    price.cacheHitPerMillion !== undefined ||
    price.cacheMissPerMillion !== undefined;
  const inputCost = hasCacheSpecificRates
    ? sumDefined(
      costForTokens(usage.cacheHitTokens, price.cacheHitPerMillion),
      costForTokens(cacheMissInputTokens(usage), price.cacheMissPerMillion ?? price.inputPerMillion),
    )
    : costForTokens(usage.inputTokens, price.inputPerMillion);
  const outputCost = costForTokens(usage.outputTokens, price.outputPerMillion);
  const totalCost = sumDefined(inputCost, outputCost);
  const estimatedCacheSavings =
    price.cacheMissPerMillion !== undefined && price.cacheHitPerMillion !== undefined
      ? Math.max(0, costForTokens(usage.cacheHitTokens, price.cacheMissPerMillion - price.cacheHitPerMillion) ?? 0)
      : undefined;

  return {
    usage,
    price,
    inputCost,
    outputCost,
    totalCost,
    estimatedCacheSavings,
    configured: inputCost !== undefined || outputCost !== undefined,
  };
}

export function formatCostEstimate(scope: string, estimate: CostEstimate): string {
  const currency = estimate.price.currency;
  return [
    "DeepSeekCode cost",
    `scope=${scope}`,
    `snapshots=${estimate.usage.snapshots}`,
    `input=${estimate.usage.inputTokens} output=${estimate.usage.outputTokens}`,
    `cacheHit=${estimate.usage.cacheHitTokens} cacheMiss=${estimate.usage.cacheMissTokens} cacheRate=${cacheRate(estimate.usage.cacheHitTokens, estimate.usage.cacheMissTokens)}`,
    `price=${formatRate("input", estimate.price.inputPerMillion)} ${formatRate("output", estimate.price.outputPerMillion)} ${formatRate("cacheHit", estimate.price.cacheHitPerMillion)} ${formatRate("cacheMiss", estimate.price.cacheMissPerMillion)}`,
    estimate.configured
      ? `estimated=${formatMoney(estimate.totalCost ?? 0, currency)} input=${formatOptionalMoney(estimate.inputCost, currency)} output=${formatOptionalMoney(estimate.outputCost, currency)} cacheSavings=${formatOptionalMoney(estimate.estimatedCacheSavings, currency)}`
      : "estimated=unconfigured",
    estimate.configured
      ? "pricing: configured from DEEPSEEKCODE_PRICE_* environment variables"
      : "pricing: set DEEPSEEKCODE_PRICE_INPUT_PER_M, DEEPSEEKCODE_PRICE_OUTPUT_PER_M, DEEPSEEKCODE_PRICE_CACHE_HIT_PER_M, and DEEPSEEKCODE_PRICE_CACHE_MISS_PER_M for estimates",
  ].join("\n");
}

function cacheMissInputTokens(usage: UsageTotals): number {
  return usage.cacheHitTokens > 0 || usage.cacheMissTokens > 0
    ? usage.cacheMissTokens
    : usage.inputTokens;
}

function costForTokens(tokens: number, perMillion: number | undefined): number | undefined {
  if (perMillion === undefined) return undefined;
  return (tokens / 1_000_000) * perMillion;
}

function sumDefined(...values: Array<number | undefined>): number | undefined {
  const present = values.filter((value): value is number => value !== undefined);
  if (present.length === 0) return undefined;
  return present.reduce((sum, value) => sum + value, 0);
}

function optionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function formatRate(label: string, value: number | undefined): string {
  return `${label}=${value === undefined ? "unset" : `${value}/M`}`;
}

function formatOptionalMoney(value: number | undefined, currency: string): string {
  return value === undefined ? "unset" : formatMoney(value, currency);
}

function formatMoney(value: number, currency: string): string {
  return `${currency} ${value.toFixed(6)}`;
}
