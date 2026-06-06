import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface HeadlessScreenshotResult {
  path: string;
  browser: string;
}

export async function captureHtmlWithHeadlessBrowser(input: {
  htmlPath: string;
  outputDir: string;
  timeoutMs?: number;
  viewport?: { width: number; height: number };
}): Promise<HeadlessScreenshotResult | undefined> {
  return captureTargetWithHeadlessBrowser({
    targetUrl: pathToFileURL(input.htmlPath).href,
    baseName: path.basename(input.htmlPath, path.extname(input.htmlPath)),
    outputDir: input.outputDir,
    timeoutMs: input.timeoutMs,
    viewport: input.viewport,
  });
}

export async function captureUrlWithHeadlessBrowser(input: {
  url: string;
  outputDir: string;
  timeoutMs?: number;
  viewport?: { width: number; height: number };
  baseName?: string;
}): Promise<HeadlessScreenshotResult | undefined> {
  return captureTargetWithHeadlessBrowser({
    targetUrl: input.url,
    baseName: input.baseName ?? "url-preview",
    outputDir: input.outputDir,
    timeoutMs: input.timeoutMs,
    viewport: input.viewport,
  });
}

async function captureTargetWithHeadlessBrowser(input: {
  targetUrl: string;
  outputDir: string;
  baseName: string;
  timeoutMs?: number;
  viewport?: { width: number; height: number };
}): Promise<HeadlessScreenshotResult | undefined> {
  const browser = findHeadlessBrowser();
  if (!browser) return undefined;

  fs.mkdirSync(input.outputDir, { recursive: true });
  const target = path.join(
    input.outputDir,
    `${safeFilename(input.baseName)}-${Date.now()}.png`,
  );
  const viewport = input.viewport ?? { width: 1440, height: 1000 };
  const args = [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    `--window-size=${viewport.width},${viewport.height}`,
    `--screenshot=${target}`,
    input.targetUrl,
  ];

  const result = await runBrowser(browser, args, input.timeoutMs ?? 15_000);
  if (result.exitCode !== 0 || !fs.existsSync(target) || fs.statSync(target).size === 0) {
    return undefined;
  }
  return { path: target, browser };
}

function findHeadlessBrowser(): string | undefined {
  const envPath = process.env.DEEPSEEKCODE_SCREENSHOT_BROWSER?.trim();
  if (envPath && fs.existsSync(envPath)) return envPath;

  const candidates = browserCandidates();
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && fs.existsSync(candidate)) return candidate;
    if (!path.isAbsolute(candidate) && commandExists(candidate)) return candidate;
  }
  return undefined;
}

function browserCandidates(): string[] {
  if (process.platform === "win32") {
    const programFiles = [
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
      process.env.LOCALAPPDATA,
    ].filter((value): value is string => Boolean(value));
    const absolute = programFiles.flatMap((root) => [
      path.join(root, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(root, "Chromium", "Application", "chrome.exe"),
    ]);
    return [...absolute, "chrome.exe", "msedge.exe", "chromium.exe"];
  }
  if (process.platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "google-chrome",
      "chromium",
      "microsoft-edge",
    ];
  }
  return [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "microsoft-edge",
  ];
}

function commandExists(command: string): boolean {
  const separator = process.platform === "win32" ? ";" : ":";
  const extensions = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  for (const dir of (process.env.PATH ?? "").split(separator)) {
    if (!dir) continue;
    for (const ext of extensions) {
      const candidate = path.join(dir, command.endsWith(ext) ? command : `${command}${ext}`);
      if (fs.existsSync(candidate)) return true;
    }
  }
  return false;
}

function runBrowser(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<{ exitCode: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ exitCode: -1, stderr });
    }, timeoutMs);
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk).slice(0, 4000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ exitCode: -1, stderr: error.message });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, stderr });
    });
  });
}

function safeFilename(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 120) || "preview";
}
