import { approximateTokens } from "../../query/promptCache.js";

export interface RequestDiagnostics {
  provider: string;
  model: string;
  kind: "chat" | "classification" | "action_plan" | "verify" | "side_question";
  stablePrefixHash?: string;
  systemChars: number;
  userChars: number;
  approxPromptTokens: number;
  createdAtMs: number;
}

export function buildRequestDiagnostics(input: {
  provider: string;
  model: string;
  kind: RequestDiagnostics["kind"];
  systemText: string;
  userText: string;
  stablePrefixHash?: string;
}): RequestDiagnostics {
  return {
    provider: input.provider,
    model: input.model,
    kind: input.kind,
    stablePrefixHash: input.stablePrefixHash,
    systemChars: input.systemText.length,
    userChars: input.userText.length,
    approxPromptTokens: approximateTokens(`${input.systemText}\n${input.userText}`),
    createdAtMs: Date.now(),
  };
}
