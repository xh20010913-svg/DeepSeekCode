let currentCwd = process.cwd();

export function getCwd(): string {
  return currentCwd;
}

export function setCwd(cwd: string): void {
  currentCwd = cwd;
}
