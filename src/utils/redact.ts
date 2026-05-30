const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9]{16,}/g,
  /(api[_-]?key\s*[:=]\s*)[^\s"']+/gi,
  /(authorization\s*[:=]\s*bearer\s+)[^\s"']+/gi,
];

export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((current, pattern) => current.replace(pattern, "$1[REDACTED]"), text);
}
