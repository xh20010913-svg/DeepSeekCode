const SECRET_PATTERNS = [
  /\b(sk-[A-Za-z0-9_-]{12,})\b/g,
  /\b(api[_-]?key|token|secret|password)\s*[:=]\s*([^\s"'`]+)/gi,
  /DEEPSEEK_API_KEY\s*=\s*[^\s"'`]+/gi,
  /DEEPSEEKCODE_WECOM_BOT_SECRET\s*=\s*[^\s"'`]+/gi,
];

export function redactRemoteText(value: string, maxChars = 1800): string {
  let text = value;
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (match, label: string | undefined) => {
      if (label && /api|token|secret|password/i.test(label)) return `${label}=<redacted>`;
      return "<redacted>";
    });
  }
  text = text.replace(/\r/g, "");
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 24)}\n...<truncated>`;
}

export function compactOneLine(value: string, maxChars = 160): string {
  const text = redactRemoteText(value, maxChars).replace(/\s+/g, " ").trim();
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 3)}...`;
}
