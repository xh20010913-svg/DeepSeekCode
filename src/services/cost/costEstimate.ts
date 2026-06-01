import { cacheRate } from "../../query/promptCache.js";
import type { UsageTotals } from "../../state/sqlite.js";

export interface TokenPriceConfig {
  currency: string;
  model?: string;
  source?: "deepseek-default" | "env" | "deepseek-default+env";
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

const DEFAULT_DEEPSEEK_PRICE_BY_MODEL: Record<string, TokenPriceConfig> = {
  "deepseek-v4-flash": {
    model: "deepseek-v4-flash",
    source: "deepseek-default",
    currency: "USD",
    inputPerMillion: 0.14,
    outputPerMillion: 0.28,
    cacheHitPerMillion: 0.0028,
    cacheMissPerMillion: 0.14,
  },
  "deepseek-v4-pro": {
    model: "deepseek-v4-pro",
    source: "deepseek-default",
    currency: "USD",
    inputPerMillion: 0.435,
    outputPerMillion: 0.87,
    cacheHitPerMillion: 0.003625,
    cacheMissPerMillion: 0.435,
  },
};

export function defaultPriceConfigForModel(model: string | undefined): TokenPriceConfig {
  const normalized = model?.trim().toLowerCase() ?? "";
  const defaults = DEFAULT_DEEPSEEK_PRICE_BY_MODEL[normalized];
  return defaults ? { ...defaults } : { currency: "USD", model };
}

export function priceConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  model?: string,
): TokenPriceConfig {
  const defaults = defaultPriceConfigForModel(model);
  const hasEnvRate = [
    env.DEEPSEEKCODE_PRICE_INPUT_PER_M,
    env.DEEPSEEKCODE_PRICE_OUTPUT_PER_M,
    env.DEEPSEEKCODE_PRICE_CACHE_HIT_PER_M,
    env.DEEPSEEKCODE_PRICE_CACHE_MISS_PER_M,
  ].some((value) => value !== undefined && value.trim() !== "");
  const source = hasEnvRate
    ? defaults.source
      ? "deepseek-default+env"
      : "env"
    : defaults.source;
  return {
    currency: env.DEEPSEEKCODE_PRICE_CURRENCY || defaults.currency || "USD",
    model: defaults.model ?? model,
    source,
    inputPerMillion: optionalNumber(env.DEEPSEEKCODE_PRICE_INPUT_PER_M) ?? defaults.inputPerMillion,
    outputPerMillion: optionalNumber(env.DEEPSEEKCODE_PRICE_OUTPUT_PER_M) ?? defaults.outputPerMillion,
    cacheHitPerMillion: optionalNumber(env.DEEPSEEKCODE_PRICE_CACHE_HIT_PER_M) ?? defaults.cacheHitPerMillion,
    cacheMissPerMillion: optionalNumber(env.DEEPSEEKCODE_PRICE_CACHE_MISS_PER_M) ?? defaults.cacheMissPerMillion,
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
      ? `pricing: ${pricingSourceText(estimate.price.source)}${estimate.price.model ? ` model=${estimate.price.model}` : ""}; override with DEEPSEEKCODE_PRICE_* environment variables`
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

function pricingSourceText(source: TokenPriceConfig["source"]): string {
  if (source === "deepseek-default") return "DeepSeek official default estimate";
  if (source === "deepseek-default+env") return "DeepSeek official default estimate with env overrides";
  if (source === "env") return "configured from env";
  return "configured";
}
