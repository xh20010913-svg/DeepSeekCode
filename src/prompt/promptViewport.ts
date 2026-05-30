export interface PromptViewport {
  before: string;
  after: string;
  prefixHidden: boolean;
  suffixHidden: boolean;
}

export interface PromptViewportDisplay extends PromptViewport {
  padding: string;
}

export function createPromptViewport(
  value: string,
  cursor: number,
  width: number,
): PromptViewport {
  const safeCursor = Math.max(0, Math.min(value.length, Math.floor(cursor)));
  const contentWidth = Math.max(1, Math.floor(width));
  const visibleTextWidth = Math.max(1, contentWidth - 1);
  if (value.length <= visibleTextWidth) {
    return {
      before: value.slice(0, safeCursor),
      after: value.slice(safeCursor),
      prefixHidden: false,
      suffixHidden: false,
    };
  }

  const leftBudget = Math.min(safeCursor, Math.max(1, Math.floor(visibleTextWidth * 0.65)));
  let start = Math.max(0, safeCursor - leftBudget);
  let end = Math.min(value.length, start + visibleTextWidth);
  if (safeCursor > end) {
    end = safeCursor;
    start = Math.max(0, end - visibleTextWidth);
  }
  if (end - start < visibleTextWidth) {
    start = Math.max(0, end - visibleTextWidth);
  }

  return {
    before: value.slice(start, safeCursor),
    after: value.slice(safeCursor, end),
    prefixHidden: start > 0,
    suffixHidden: end < value.length,
  };
}

export function createPromptViewportDisplay(
  value: string,
  cursor: number,
  width: number,
): PromptViewportDisplay {
  const viewport = createPromptViewport(value, cursor, width);
  const used =
    (viewport.prefixHidden ? 3 : 0) +
    cellWidth(viewport.before) +
    1 +
    cellWidth(viewport.after) +
    (viewport.suffixHidden ? 3 : 0);
  return {
    ...viewport,
    padding: " ".repeat(Math.max(0, Math.floor(width) - used)),
  };
}

export function cellWidth(value: string): number {
  let width = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    width += isWideCodePoint(code) ? 2 : 1;
  }
  return width;
}

function isWideCodePoint(code: number): boolean {
  return (
    code >= 0x1100 &&
    (
      code <= 0x115f ||
      code === 0x2329 ||
      code === 0x232a ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6)
    )
  );
}
