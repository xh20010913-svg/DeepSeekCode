export interface TextInputState {
  value: string;
  cursor: number;
}

export interface TextInputSelection {
  start: number;
  end: number;
}

export type TextInputMode = "insert" | "normal";
