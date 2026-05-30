const FRAMES = ["-", "\\", "|", "/"];

export function spinnerFrame(frame: number): string {
  return FRAMES[Math.abs(Math.floor(frame)) % FRAMES.length] ?? "-";
}
