export type KeybindingContextName = string;
export type KeybindingAction = string;

export interface ParsedKeystroke {
  key?: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

export interface ParsedBinding {
  action: KeybindingAction;
  keys: ParsedKeystroke[];
  source?: string;
}

export interface KeybindingBlock {
  context?: KeybindingContextName;
  bindings?: Record<string, KeybindingAction> | ParsedBinding[];
}

export interface KeybindingValidationMessage {
  severity: "error" | "warning";
  message: string;
  suggestion?: string;
}
