export interface StatusLineState {
  left: string;
  right?: string;
  tone?: "muted" | "brand" | "success" | "warning" | "error";
}
