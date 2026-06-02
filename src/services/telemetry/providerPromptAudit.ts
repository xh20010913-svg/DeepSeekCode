import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { approximateTokens } from "../../query/promptCache.js";

export function captureProviderPrompt(input: {
  provider: string;
  model: string;
  label: string;
  body: Record<string, unknown>;
}): string | undefined {
  const dir = promptAuditDir();
  if (!dir) return undefined;
  fs.mkdirSync(dir, { recursive: true });
  const now = Date.now();
  const messages = Array.isArray(input.body.messages)
    ? input.body.messages.map(normalizeMessage)
    : [];
  const payload = {
    id: `prompt_${now}_${randomUUID()}`,
    createdAtMs: now,
    createdAtIso: new Date(now).toISOString(),
    provider: input.provider,
    model: input.model,
    label: input.label,
    request: sanitizeRequest(input.body),
    messages,
    approxPromptTokens: approximateTokens(messages.map((message) => message.content).join("\n")),
  };
  const file = path.join(dir, `${payload.id}.json`);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  appendJsonl(path.join(dir, "prompts.jsonl"), payload);
  return file;
}

function promptAuditDir(): string | undefined {
  const explicit = process.env.DEEPSEEKCODE_PROMPT_AUDIT_DIR?.trim();
  if (explicit) return path.resolve(explicit);
  return undefined;
}

function normalizeMessage(value: unknown): {
  role: string;
  content: string;
  chars: number;
  tool_call_id?: string;
  tool_calls?: Array<{ id?: string; name?: string; arguments?: string }>;
} {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const content = stringifyContent(record.content);
  const sanitized = redactSecrets(content);
  const message = {
    role: typeof record.role === "string" ? record.role : "unknown",
    content: truncatePromptContent(sanitized),
    chars: sanitized.length,
  };
  if (typeof record.tool_call_id === "string") {
    return { ...message, tool_call_id: record.tool_call_id };
  }
  if (Array.isArray(record.tool_calls)) {
    return {
      ...message,
      tool_calls: record.tool_calls.map(normalizeToolCall),
    };
  }
  return message;
}

function normalizeToolCall(value: unknown): { id?: string; name?: string; arguments?: string } {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const fn = record.function && typeof record.function === "object"
    ? record.function as Record<string, unknown>
    : {};
  return {
    id: typeof record.id === "string" ? record.id : undefined,
    name: typeof fn.name === "string" ? fn.name : undefined,
    arguments: typeof fn.arguments === "string"
      ? truncatePromptContent(redactSecrets(fn.arguments))
      : undefined,
  };
}

function sanitizeRequest(body: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === "messages") {
      copy.messages = Array.isArray(value) ? value.map(normalizeMessage) : [];
      continue;
    }
    if (isSensitiveKey(key)) {
      copy[key] = "[REDACTED]";
      continue;
    }
    copy[key] = sanitizeValue(value);
  }
  return copy;
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return truncatePromptContent(redactSecrets(value));
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      output[key] = isSensitiveKey(key)
        ? "[REDACTED]"
        : sanitizeValue(nested);
    }
    return output;
  }
  return value;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  if (["authorization", "api_key", "apikey", "password", "secret", "token"].includes(normalized)) return true;
  return /(^|[_-])(api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|secret|password)$/i.test(normalized);
}

function stringifyContent(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value ?? "");
}

function truncatePromptContent(value: string): string {
  const maxChars = Number(process.env.DEEPSEEKCODE_PROMPT_AUDIT_MAX_CHARS ?? 50_000);
  const limit = Number.isFinite(maxChars) && maxChars > 0 ? Math.trunc(maxChars) : 50_000;
  return value.length <= limit ? value : `${value.slice(0, limit)}\n[TRUNCATED ${value.length - limit} chars]`;
}

function redactSecrets(value: string): string {
  return value
    .replace(/(sk-[A-Za-z0-9_-]{16,})/g, "[REDACTED_API_KEY]")
    .replace(/((?:api[_-]?key|token|secret|password)\s*[:=]\s*)[^\s"'`]+/gi, "$1[REDACTED]");
}

function appendJsonl(file: string, payload: unknown): void {
  fs.appendFileSync(file, `${JSON.stringify(payload)}\n`, "utf8");
}
