export interface TerminalKeyState {
  backspace?: boolean;
  delete?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  name?: string;
  sequence?: string;
}

export type DeleteKeyAction = "backspace" | "delete";

export function isBackspaceInput(input: string | undefined, key: TerminalKeyState): boolean {
  const sequence = key.sequence ?? input;
  if (rawDeleteAction(sequence ?? "") === "backspace") return true;
  return Boolean(key.backspace) ||
    key.name === "backspace" ||
    sequence === "\b" ||
    sequence === "\x7f" ||
    (Boolean(key.ctrl) && input?.toLowerCase() === "h");
}

export function isDeleteInput(input: string | undefined, key: TerminalKeyState): boolean {
  const sequence = key.sequence ?? input;
  const rawAction = rawDeleteAction(sequence ?? "");
  if (rawAction === "backspace") return false;
  if (rawAction === "delete") return true;
  return Boolean(key.delete) || key.name === "delete" || sequence === "\x1b[3~";
}

export function isPrintableInput(input: string | undefined, key: TerminalKeyState): input is string {
  if (!input || key.ctrl || key.meta) return false;
  return !/[\u0000-\u001f\u007f]/.test(input) && !input.startsWith("\x1b");
}

export function rawDeleteAction(data: Buffer | string): DeleteKeyAction | null {
  const input = Buffer.isBuffer(data) ? data.toString("utf8") : data;
  if (input.includes("\x1b[3~") || input.includes("\x1b[3;5~")) return "delete";
  if (input.includes("\b") || input.includes("\x7f")) return "backspace";
  return null;
}

export function keypressDeleteAction(
  input: string | undefined,
  key: TerminalKeyState | undefined,
): DeleteKeyAction | null {
  const rawAction = rawDeleteAction(key?.sequence ?? input ?? "");
  if (key?.name === "backspace") return "backspace";
  if (key?.backspace) return "backspace";
  if (rawAction === "backspace") return "backspace";
  if (rawAction === "delete") return "delete";
  const hasRawSequence = Boolean(key?.sequence || input);
  if (isAmbiguousWindowsDeleteKey(key) && !hasRawSequence) {
    return "backspace";
  }
  if (key?.name === "delete") return "delete";
  if (key?.delete) return "delete";
  return null;
}

function isAmbiguousWindowsDeleteKey(key: TerminalKeyState | undefined): boolean {
  if (process.platform !== "win32") return false;
  if (process.env.DEEPSEEKCODE_STRICT_DELETE_KEY === "1") return false;
  return Boolean(key?.name === "delete" || key?.delete);
}
