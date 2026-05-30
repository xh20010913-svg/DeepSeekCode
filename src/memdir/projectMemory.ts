import fs from "node:fs";
import path from "node:path";

export function memoryFilePath(projectRoot: string): string {
  return path.join(projectRoot, ".deepseekcode", "memory.md");
}

export function readProjectMemory(projectRoot: string): string {
  const filePath = memoryFilePath(projectRoot);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

export function appendProjectMemory(projectRoot: string, text: string): void {
  const filePath = memoryFilePath(projectRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${text.trim()}\n`, "utf8");
}
